import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import styles from "../styles/videoComponent.module.css";
import server from "../environment.js";

const server_url = server;
var connections = {};
const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoref = useRef();
  const videoRef = useRef([]);

  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [video, setVideo] = useState([]);
  const [audio, setAudio] = useState();
  const [screen, setScreen] = useState();
  const [showModal, setModal] = useState(true);
  const [screenAvailable, setScreenAvailable] = useState();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(3);
  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    getPermissions();
  }, []);

  const getPermissions = async () => {
    try {
      const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
      setVideoAvailable(!!videoPermission);
      console.log("Video permission", !!videoPermission);

      const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioAvailable(!!audioPermission);
      console.log("Audio permission", !!audioPermission);

      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

      if (videoAvailable || audioAvailable) {
        const userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoAvailable,
          audio: audioAvailable,
        });

        if (userMediaStream) {
          window.localStream = userMediaStream;
          if (localVideoref.current) {
            localVideoref.current.srcObject = userMediaStream;
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (video !== undefined && audio !== undefined) {
      getUserMedia();
    }
  }, [video, audio]);

  const getUserMedia = () => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices
        .getUserMedia({ video: video, audio: audio })
        .then(getUserMediaSuccess)
        .catch((e) => console.log(e));
    }
  };

  const getUserMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {}

    window.localStream = stream;
    localVideoref.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      stream.getTracks().forEach((track) => {
        const existingSender = connections[id]
          .getSenders()
          .find((s) => s.track && s.track.kind === track.kind);

        if (existingSender) {
          existingSender.replaceTrack(track);
        } else {
          connections[id].addTrack(track, stream);
        }
      });

      connections[id].createOffer().then((description) => {
        connections[id].setLocalDescription(description).then(() => {
          socketRef.current.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }));
        });
      });
    }
  };

  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("signal", gotMessageFromServer);

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("chat-message", addMessage);
      socketRef.current.on("user-left", (id) => {
        setVideos((v) => v.filter((video) => video.socketId !== id));
      });

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach((socketListId) => {
          connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

          connections[socketListId].onicecandidate = (event) => {
            if (event.candidate) {
              socketRef.current.emit("signal", socketListId, JSON.stringify({ ice: event.candidate }));
            }
          };

          connections[socketListId].ontrack = (event) => {
            const [stream] = event.streams;
            const existing = videoRef.current.find((v) => v.socketId === socketListId);

            if (existing) {
              setVideos((prev) => {
                const updated = prev.map((v) =>
                  v.socketId === socketListId ? { ...v, stream } : v
                );
                videoRef.current = updated;
                return updated;
              });
            } else {
              const newVideo = {
                socketId: socketListId,
                stream,
                autoplay: true,
                playsinline: true,
              };
              setVideos((prev) => {
                const updated = [...prev, newVideo];
                videoRef.current = updated;
                return updated;
              });
            }
          };

          if (window.localStream) {
            window.localStream.getTracks().forEach((track) => {
              const existingSender = connections[socketListId]
                .getSenders()
                .find((s) => s.track && s.track.kind === track.kind);

              if (existingSender) {
                existingSender.replaceTrack(track);
              } else {
                connections[socketListId].addTrack(track, window.localStream);
              }
            });
          }
        });

        if (id === socketIdRef.current) {
          for (let id2 in connections) {
            if (id2 === socketIdRef.current) continue;

            window.localStream.getTracks().forEach((track) => {
              const existingSender = connections[id2]
                .getSenders()
                .find((s) => s.track && s.track.kind === track.kind);

              if (existingSender) {
                existingSender.replaceTrack(track);
              } else {
                connections[id2].addTrack(track, window.localStream);
              }
            });

            connections[id2].createOffer().then((description) => {
              connections[id2].setLocalDescription(description).then(() => {
                socketRef.current.emit("signal", id2, JSON.stringify({ sdp: connections[id2].localDescription }));
              });
            });
          }
        }
      });
    });
  };

  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);
    if (fromId !== socketIdRef.current) {
      if (signal.sdp) {
        connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
          if (signal.sdp.type === "offer") {
            connections[fromId].createAnswer().then((description) => {
              connections[fromId].setLocalDescription(description).then(() => {
                socketRef.current.emit("signal", fromId, JSON.stringify({ sdp: connections[fromId].localDescription }));
              });
            });
          }
        });
      }

      if (signal.ice) {
        connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice));
      }
    }
  };

  const black = ({ width = 640, height = 480 } = {}) => {
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    canvas.getContext("2d").fillRect(0, 0, width, height);
    const stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };

  const silence = () => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };

  const handleVideo = () => setVideo(!video);
  const handleAudio = () => setAudio(!audio);
  const handleEndCall = () => {
    try {
      localVideoref.current.srcObject.getTracks().forEach((track) => track.stop());
    } catch (e) {}
    window.location.href = "/";
  };

  const handleScreen = () => setScreen(!screen);

  useEffect(() => {
    if (screen !== undefined) {
      getDisplayMedia();
    }
  }, [screen]);

  const getDisplayMedia = () => {
    if (screen) {
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then((stream) => {
        window.localStream.getTracks().forEach((track) => track.stop());
        window.localStream = stream;
        localVideoref.current.srcObject = stream;

        for (let id in connections) {
          if (id === socketIdRef.current) continue;

          stream.getTracks().forEach((track) => {
            const existingSender = connections[id]
              .getSenders()
              .find((s) => s.track && s.track.kind === track.kind);

            if (existingSender) {
              existingSender.replaceTrack(track);
            } else {
              connections[id].addTrack(track, stream);
            }
          });

          connections[id].createOffer().then((description) => {
            connections[id].setLocalDescription(description).then(() => {
              socketRef.current.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }));
            });
          });
        }

        stream.getTracks().forEach((track) => {
          track.onended = () => {
            setScreen(false);
            const blackSilenceStream = new MediaStream([black(), silence()]);
            window.localStream = blackSilenceStream;
            localVideoref.current.srcObject = blackSilenceStream;
            getUserMedia();
          };
        });
      });
    }
  };

  const addMessage = (data, sender, socketIdSender) => {
    setMessages((prev) => [...prev, { sender, data }]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages((prev) => prev + 1);
    }
  };

  const sendMessage = () => {
    socketRef.current.emit("chat-message", message, username);
    setMessage("");
  };

  const connect = () => {
    setAskForUsername(false);
    setVideo(videoAvailable);
    setAudio(audioAvailable);
    setTimeout(() => connectToSocketServer(), 200);
  };

  return (
    <div>
      {askForUsername ? (
        <div>
          <h2>Enter into Lobby</h2>
          <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Button onClick={connect}>Connect</Button>
          <video ref={localVideoref} autoPlay muted></video>
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          {showModal && (
            <div className={styles.chatRoom}>
              <div className={styles.chatContainer}>
                <h1>Chat</h1>
                <div className={styles.chattingDisplay}>
                  {messages.length > 0 ? (
                    messages.map((msg, i) => (
                      <div key={i} style={{ marginBottom: "20px" }}>
                        <p style={{ fontWeight: "bold" }}>{msg.sender}</p>
                        <p>{msg.data}</p>
                      </div>
                    ))
                  ) : (
                    <p>No Messages Yet</p>
                  )}
                </div>
                <div className={styles.chattingArea}>
                  <TextField value={message} onChange={(e) => setMessage(e.target.value)} label="Enter Your chat" />
                  <Button onClick={sendMessage}>Send</Button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.buttonContainers}>
            <IconButton onClick={handleVideo} style={{ color: "white" }}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={handleEndCall} style={{ color: "red" }}>
              <CallEndIcon />
            </IconButton>
            <IconButton onClick={handleAudio} style={{ color: "white" }}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            {screenAvailable && (
              <IconButton onClick={handleScreen} style={{ color: "white" }}>
                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
              </IconButton>
            )}
            <Badge badgeContent={newMessages} color="orange">
              <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}>
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          <video className={styles.meetUserVideo} ref={localVideoref} autoPlay muted></video>

          <div className={styles.conferenceView}>
            {videos.map((video) => (
              <div key={video.socketId}>
                <video
                  data-socket={video.socketId}
                  ref={(ref) => {
                    if (ref && video.stream) {
                      ref.srcObject = video.stream;
                    }
                  }}
                  autoPlay
                  playsInline
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
