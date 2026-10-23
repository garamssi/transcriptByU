import { ApiError, ERROR_CODES, toApiError } from '../domain/api-error.js';
import {
  MAX_INLINE_WAIT_MS, MIN_REQUEST_INTERVAL_MS, MAX_REQUEST_INTERVAL_MS,
} from '../domain/constants.js';

const C = ERROR_CODES;

// 오류 코드별 즉시 재시도 횟수 (서비스 워커 안에서, MAX_INLINE_WAIT_MS 이내 대기만)
const INLINE_RETRIES = {
  [C.RATE_LIMIT]: 2,
  [C.SERVER]: 2,
  [C.NETWORK]: 2,
  [C.TIMEOUT]: 1,
  [C.EMPTY_RESPONSE]: 1,
};
const DEFAULT_RATE_LIMIT_WAIT_MS = 10_000;
const KEEPALIVE_INTERVAL_MS = 15_000;

/** API 를 호출하지 않고 스케줄러가 바로 돌려보낸 오류 (로그 중복 방지용 표시). */
function localError(code, retryAfterMs, detail) {
  const err = new ApiError(code, { retryAfterMs, detail });
  err.local = true;
  return err;
}

const defaultSleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * 메모리 차단 저장소 (테스트·기본값). background 는 chrome.storage.session 구현을 주입한다.
 */
export function createMemoryBlockStore() {
  let blocks = {};
  return {
    async get(key) { return blocks[key] || null; },
    async set(key, value) { blocks[key] = value; },
    async clear() { blocks = {}; },
  };
}

/**
 * 모든 탭·경로의 클라우드 API 호출을 프로바이더별 대기열 하나로 직렬화한다.
 * - 요청 시작 간격을 적응형으로 조절한다 (429 → 2배, 성공 → 0.8배).
 * - 짧은 대기(≤ MAX_INLINE_WAIT_MS)는 여기서 기다렸다가 재시도하고,
 *   그보다 긴 대기는 즉시 RATE_LIMIT(retryAfterMs)로 돌려보낸다.
 *   (서비스 워커 안에서 오래 버티지 않기 위함)
 * - 일일 한도 소진(QUOTA_DAILY)은 blockStore 에 기록해 초기화 시각까지 API 를 호출하지 않는다.
 * claude-code 는 로컬 프록시가 자체 큐잉하므로 그대로 통과시킨다.
 */
export class RequestScheduler {
  constructor({
    now = Date.now,
    sleep = defaultSleep,
    keepAlive = () => {},
    blockStore = createMemoryBlockStore(),
    minIntervalMs = MIN_REQUEST_INTERVAL_MS,
    maxIntervalMs = MAX_REQUEST_INTERVAL_MS,
    maxInlineWaitMs = MAX_INLINE_WAIT_MS,
  } = {}) {
    this.now = now;
    this.sleep = sleep;
    this.keepAlive = keepAlive;
    this.blockStore = blockStore;
    this.minIntervalMs = minIntervalMs;
    this.maxIntervalMs = maxIntervalMs;
    this.maxInlineWaitMs = maxInlineWaitMs;
    this.lanes = new Map();
    this.active = 0;
    this.keepAliveTimer = null;
  }

  /** 설정(키·프로바이더) 변경 시 차단·쿨다운을 초기화한다. */
  async reset() {
    this.lanes.clear();
    await this.blockStore.clear();
  }

  lane(provider) {
    let lane = this.lanes.get(provider);
    if (!lane) {
      lane = { tail: Promise.resolve(), intervalMs: this.minIntervalMs, nextStartAt: 0, cooldownUntil: 0 };
      this.lanes.set(provider, lane);
    }
    return lane;
  }

  /**
   * @param {{provider: string, model: string}} target
   * @param {() => Promise<string>} task - API 1회 호출
   * @param {{ onStart?: () => void, onRetry?: (code: string, waitMs: number) => void }} [hooks]
   *   onStart: 대기열 차례가 와서 실제 처리를 시작할 때 (큐 대기 시간 측정 제외용)
   */
  run({ provider, model }, task, hooks = {}) {
    if (provider === 'claude-code') {
      hooks.onStart?.();
      return this.tracked(() => task());
    }
    const lane = this.lane(provider);
    const result = lane.tail.then(() => this.tracked(() => this.execute(lane, `${provider}:${model}`, task, hooks)));
    lane.tail = result.catch(() => {}); // 실패해도 다음 요청은 이어서 처리
    return result;
  }

  async execute(lane, blockKey, task, hooks) {
    const block = await this.blockStore.get(blockKey);
    if (block && block.until > this.now()) {
      throw localError(block.code || C.QUOTA_DAILY, block.until - this.now(), 'blocked until quota reset');
    }

    const retriesUsed = {};
    let started = false;
    for (;;) {
      const startAt = Math.max(lane.nextStartAt, lane.cooldownUntil);
      const waitMs = startAt - this.now();
      if (waitMs > this.maxInlineWaitMs) {
        throw localError(C.RATE_LIMIT, waitMs, 'cooling down after rate limit');
      }
      if (waitMs > 0) await this.sleep(waitMs);
      lane.nextStartAt = this.now() + lane.intervalMs;
      // 첫 실제 호출 직전에 한 번만 알린다 (큐·간격 대기는 제외, 재시도 대기는 포함).
      if (!started) {
        started = true;
        hooks.onStart?.();
      }

      try {
        const text = await task();
        lane.intervalMs = Math.max(this.minIntervalMs, Math.round(lane.intervalMs * 0.8));
        return text;
      } catch (raw) {
        const err = toApiError(raw);

        if (err.code === C.QUOTA_DAILY) {
          await this.blockStore.set(blockKey, { code: err.code, until: this.now() + (err.retryAfterMs || 3600_000) });
          throw err;
        }

        const limit = INLINE_RETRIES[err.code] || 0;
        const used = retriesUsed[err.code] || 0;
        let retryWaitMs;
        if (err.code === C.RATE_LIMIT) {
          lane.intervalMs = Math.min(this.maxIntervalMs, lane.intervalMs * 2);
          retryWaitMs = err.retryAfterMs ?? DEFAULT_RATE_LIMIT_WAIT_MS;
          lane.cooldownUntil = this.now() + retryWaitMs;
        } else {
          retryWaitMs = err.retryAfterMs ?? (2000 * 2 ** used + Math.floor(Math.random() * 500));
        }

        if (used >= limit || retryWaitMs > this.maxInlineWaitMs) {
          if (err.code === C.RATE_LIMIT) err.retryAfterMs = retryWaitMs;
          throw err;
        }
        retriesUsed[err.code] = used + 1;
        hooks.onRetry?.(err.code, retryWaitMs);
        if (err.code !== C.RATE_LIMIT) await this.sleep(retryWaitMs); // RATE_LIMIT 은 루프 상단 cooldown 대기로 처리
      }
    }
  }

  /** 진행 중인 요청이 있는 동안 주기적으로 확장 API 를 호출해 서비스 워커 종료를 막는다. */
  async tracked(fn) {
    this.active++;
    if (!this.keepAliveTimer) {
      this.keepAlive();
      this.keepAliveTimer = setInterval(() => this.keepAlive(), KEEPALIVE_INTERVAL_MS);
    }
    try {
      return await fn();
    } finally {
      this.active--;
      if (this.active === 0 && this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
    }
  }
}
