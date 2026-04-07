❯ https://vtt-c.udemycdn.com/22179512/en_IN/386ee11a-bc35-4971-bbf3-67d3a90b0a96.vtt?Expires=1775583258&Signature=6yHMDUotXuVb~d9uu~9o-sJssBsjdiAMPWWX4~pm~d43XKxjwING7
SZmKLfxZF~rpr-21HFIMNqqdzC7tRL-1FGAVzyU9unZLu7DFCaONJQqbIZUkmAM7KY0g6LcCkk0wFW8-6Q2amLnT~xGz647zdHxK~x6VMYRNT-qJRlBoubt15R8jgbcay~XK5rEScAmQqPEKQC97OVo8BayEAXjYrWtlx5p
jtlcwBz9HYxHwMhURwQLK8tkwyvlIqzK-J7IgOvZqrP0ppAjDRHjT72lZc2o85g6cWDcdGaPRicDA-TabUlERCRj~KBtfQTK7ideUlSi4~vMt5UbW1IRRIqKcA__&Key-Pair-Id=K3MG148K9RIRF4


WEBVTT

00:00.240 --> 00:01.440                                                                                                                                                 
Welcome back.

00:01.440 --> 00:09.000                                                                                                                                                 
In the previous session, we learn how the replicas are distributed among the brokers in the cluster.

00:09.060 --> 00:15.170                                                                                                                                                 
In this lecture, I'll talk about the responsibilities of the leader and the followers.

00:15.210 --> 00:19.300                                                                                                                                                 
So, let's start.

00:19.590 --> 00:28.490                                                                                                                                                 
We learned that the broker manages two types of partitions. Leader partition and Follower partition. Depending

00:28.490 --> 00:30.200                                                                                                                                                 
upon the partition type,

00:30.260 --> 00:39.190                                                                                                                                                 
a typical broker performs two kinds of activities. Leader activities and follower activities.

00:39.220 --> 00:47.330                                                                                                                                                 
Let us try to understand it. In the example, we allocated 30 replicas amongst six brokers.

00:47.780 --> 00:51.830                                                                                                                                                 
Now each broker owns multiple replicas.

00:52.040 --> 01:00.950                                                                                                                                                 
For example, the broker 4 holds six replicas. Two of these replicas of the leader partitions, and the

01:00.950 --> 01:10.710                                                                                                                                                 
remaining four are the following partition. So, the broker acts as a leader for the two leader partitions,

01:11.790 --> 01:17.670                                                                                                                                                 
and it also acts as a follower for the remaining four follower partitions.

01:17.700 --> 01:18.650                                                                                                                                                 
What does that mean?

01:19.620 --> 01:26.340                                                                                                                                                 
Let's try to understand, what does it mean by a broker to act as a leader.

01:27.440 --> 01:36.140                                                                                                                                                 
Regarding Kafka broker, being a leader means one thing. The leader is responsible for all the requests

01:36.410 --> 01:40.030                                                                                                                                                 
from the producers and consumers.

01:40.070 --> 01:46.850                                                                                                                                                 
For example, let's assume that a producer wants to send some messages to a Kafka topic.

01:47.920 --> 01:54.640                                                                                                                                                 
So the producer will connect to one of the brokers in the cluster and query for the topic

01:54.640 --> 02:03.100                                                                                                                                                 
metadata. All Kafka brokers can answer the metadata request, and hence the producer can connect to any

02:03.100 --> 02:06.880                                                                                                                                                 
of the broker and query for that metadata.

02:06.880 --> 02:15.210                                                                                                                                                 
The metadata contains a list of all the leader partitions and their respective host and port information.

02:15.260 --> 02:20.010                                                                                                                                                 
Now the producer has a list of all leaders.

02:20.150 --> 02:27.900                                                                                                                                                 
It is the producer that decides on which partition does it want to send the data, and accordingly send

02:27.900 --> 02:30.820                                                                                                                                                 
the message to the respective broker.

02:31.010 --> 02:39.560                                                                                                                                                 
That means the producer directly transmits the message to a leader. On receiving the message,

02:39.560 --> 02:47.440                                                                                                                                                 
the leader broker persists the message in the leader partition and sends back an acknowledgement. Similarly,

02:47.950 --> 02:51.130                                                                                                                                                 
when a consumer wants to read message.

02:51.130 --> 02:55.020                                                                                                                                                 
It always reads from the leader of the partition.

02:55.270 --> 03:00.040                                                                                                                                                 
We learn more detail about the producer and consumer interaction in the next section.

03:00.040 --> 03:07.150                                                                                                                                                 
However, at this stage, you should be clear that the producer and the consumer always interact with the

03:07.150 --> 03:11.710                                                                                                                                                 
leader. And that's what is the responsibility of the leader

03:11.700 --> 03:17.380                                                                                                                                                 
broker. Interact with the producer and the consumer.

03:18.370 --> 03:25.330                                                                                                                                                 
Now let's come back to the follower. Kafka broker also acts as a follower for the follower partitions

03:25.360 --> 03:34.240                                                                                                                                                 
that are allocated to the broker. In the figure, the broker B4 owns four follower partitions and hence

03:34.660 --> 03:40.720                                                                                                                                                 
the B4 acts as a follower for these replicas. Followers do not serve

03:40.720 --> 03:50.020                                                                                                                                                 
producer and consumer requests. Their only job is to copy messages from the leader and stay up to date

03:50.050 --> 03:52.660                                                                                                                                                 
with all the messages.

03:52.680 --> 03:56.880                                                                                                                                                 
The aim of the follower is to get elected as a leader

03:57.090 --> 04:06.820                                                                                                                                                 
when the current leader fails or dies. So, they have a single point agenda. Stay in sync with the leader.

04:06.870 --> 04:08.090                                                                                                                                                 
Why?

04:08.310 --> 04:16.080                                                                                                                                                 
Because they can't get elected as a leader if they are falling behind the leader and fail to be in sync

04:16.080 --> 04:16.710                                                                                                                                                 
with the leader

04:16.710 --> 04:24.020                                                                                                                                                 
by copying all the messages. The next question is this  - How does the follower stay in sync with the leader?

04:25.230 --> 04:32.700                                                                                                                                                 
To stay in sync with the leader, the follower connects to the leader and requests for the data. The leader

04:32.700 --> 04:40.230                                                                                                                                                 
send some messages, and the followed persists them in the replica and requests for more.

04:40.230 --> 04:47.810                                                                                                                                                 
This goes on forever as an infinite loop to ensure that the followers are in sync with the leader.

04:47.880 --> 04:48.430                                                                                                                                                 
Great.

04:48.570 --> 04:49.840                                                                                                                                                 
See you again.

04:49.890 --> 04:52.560                                                                                                                                                 
Keep learning and keep growing.  