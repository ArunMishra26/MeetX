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
const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
let connections = {};

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
      const videoPermission = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      setVideoAvailable(!!videoPermission);

      const audioPermission = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setAudioAvailable(!!audioPermission);

      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

      if (videoAvailable || audioAvailable) {
        const userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoAvailable,
          audio: audioAvailable,
        });
        window.localStream = userMediaStream;
        if (localVideoref.current) {
          localVideoref.current.srcObject = userMediaStream;
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

  const getMedia = () => {
    setVideo(videoAvailable);
    setAudio(audioAvailable);
    setTimeout(connectToSocketServer, 200);
  };

  const getUserMedia = () => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices
        .getUserMedia({ video: video, audio: audio })
        .then(getUserMediaSuccess)
        .catch((e) => console.error(e));
    }
  };

  const getUserMediaSuccess = (stream) => {
    try {
      window.localStream?.getTracks().forEach((track) => track.stop());
    } catch (e) {}

    window.localStream = stream;
    localVideoref.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      stream.getTracks().forEach((track) => {
        connections[id].addTrack(track, stream);
      });

      connections[id].createOffer().then((desc) => {
        connections[id].setLocalDescription(desc).then(() => {
          socketRef.current.emit("signal", id, JSON.stringify({ sdp: desc }));
        });
      });
    }

    stream.getTracks().forEach((track) => {
      track.onended = () => {
        setVideo(false);
        setAudio(false);

        const fallback = new MediaStream([black(), silence()]);
        window.localStream = fallback;
        localVideoref.current.srcObject = fallback;
        for (let id in connections) {
          fallback.getTracks().forEach((track) => {
            connections[id].addTrack(track, fallback);
          });

          connections[id].createOffer().then((desc) => {
            connections[id].setLocalDescription(desc).then(() => {
              socketRef.current.emit(
                "signal",
                id,
                JSON.stringify({ sdp: desc })
              );
            });
          });
        }
      };
    });
  };

  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("signal", gotMessageFromServer);
    socketRef.current.on("connect", () => {
      socketIdRef.current = socketRef.current.id;
      socketRef.current.emit("join-call", window.location.href);

      socketRef.current.on("chat-message", addMessage);
      socketRef.current.on("user-left", (id) =>
        setVideos((v) => v.filter((vid) => vid.socketId !== id))
      );

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach((clientId) => {
          connections[clientId] = new RTCPeerConnection(peerConfigConnections);

          connections[clientId].onicecandidate = (e) => {
            if (e.candidate) {
              socketRef.current.emit(
                "signal",
                clientId,
                JSON.stringify({ ice: e.candidate })
              );
            }
          };

          connections[clientId].ontrack = (event) => {
            const [stream] = event.streams;
            const exists = videoRef.current.find(
              (v) => v.socketId === clientId
            );
            if (exists) {
              setVideos((prev) => {
                const updated = prev.map((v) =>
                  v.socketId === clientId ? { ...v, stream } : v
                );
                videoRef.current = updated;
                return updated;
              });
            } else {
              const newVideo = {
                socketId: clientId,
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
            window.localStream
              .getTracks()
              .forEach((track) =>
                connections[clientId].addTrack(track, window.localStream)
              );
          }
        });

        if (id === socketIdRef.current) {
          for (let peerId in connections) {
            if (peerId === socketIdRef.current) continue;
            window.localStream
              .getTracks()
              .forEach((track) =>
                connections[peerId].addTrack(track, window.localStream)
              );
            connections[peerId].createOffer().then((desc) => {
              connections[peerId].setLocalDescription(desc).then(() => {
                socketRef.current.emit(
                  "signal",
                  peerId,
                  JSON.stringify({ sdp: desc })
                );
              });
            });
          }
        }
      });
    });
  };

  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);
    if (fromId === socketIdRef.current) return;

    if (signal.sdp) {
      connections[fromId]
        .setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(() => {
          if (signal.sdp.type === "offer") {
            connections[fromId].createAnswer().then((desc) => {
              connections[fromId].setLocalDescription(desc).then(() => {
                socketRef.current.emit(
                  "signal",
                  fromId,
                  JSON.stringify({ sdp: desc })
                );
              });
            });
          }
        });
    }

    if (signal.ice) {
      connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice));
    }
  };

  const black = ({ width = 640, height = 480 } = {}) => {
    const canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
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
  const handleScreen = () => setScreen(!screen);

  useEffect(() => {
    if (screen !== undefined) {
      getDisplayMedia();
    }
  }, [screen]);

  const getDisplayMedia = () => {
    if (!screen) return;
    navigator.mediaDevices
      .getDisplayMedia({ video: true, audio: true })
      .then((stream) => {
        window.localStream.getTracks().forEach((track) => track.stop());
        window.localStream = stream;
        localVideoref.current.srcObject = stream;

        for (let id in connections) {
          if (id === socketIdRef.current) continue;
          stream.getTracks().forEach((track) => {
            connections[id].addTrack(track, stream);
          });

          connections[id].createOffer().then((desc) => {
            connections[id].setLocalDescription(desc).then(() => {
              socketRef.current.emit(
                "signal",
                id,
                JSON.stringify({ sdp: desc })
              );
            });
          });
        }

        stream.getTracks().forEach((track) => {
          track.onended = () => {
            setScreen(false);
            const fallback = new MediaStream([black(), silence()]);
            window.localStream = fallback;
            localVideoref.current.srcObject = fallback;
            getUserMedia();
          };
        });
      });
  };

  const handleEndCall = () => {
    localVideoref.current?.srcObject
      ?.getTracks()
      .forEach((track) => track.stop());
    window.location.href = "/";
  };

  const openChat = () => {
    setModal(true);
    setNewMessages(0);
  };

  const handleMessage = (e) => setMessage(e.target.value);

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
    getMedia();
  };

  return (
    <div>
      {askForUsername ? (
        <div>
          <h2>Enter into Lobby</h2>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
          />
          <Button variant="contained" onClick={connect}>
            Connect
          </Button>
          <video ref={localVideoref} autoPlay muted />
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          {showModal && (
            <div className={styles.chatRoom}>
              <div className={styles.chatContainer}>
                <h1>Chat</h1>
                <div className={styles.chattingDisplay}>
                  {messages.length ? (
                    messages.map((msg, idx) => (
                      <div key={idx}>
                        <p>
                          <strong>{msg.sender}</strong>
                        </p>
                        <p>{msg.data}</p>
                      </div>
                    ))
                  ) : (
                    <p>No Messages Yet</p>
                  )}
                </div>
                <div className={styles.chattingArea}>
                  <TextField
                    value={message}
                    onChange={handleMessage}
                    label="Enter Your chat"
                    variant="outlined"
                  />
                  <Button variant="contained" onClick={sendMessage}>
                    Send
                  </Button>
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
                {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
              </IconButton>
            )}
            <Badge badgeContent={newMessages} color="error">
              <IconButton
                onClick={() => setModal(!showModal)}
                style={{ color: "white" }}
              >
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>
          <video
            className={styles.meetUserVideo}
            ref={localVideoref}
            autoPlay
            muted
          />
          <div className={styles.conferenceView}>
            {videos.map((v) => (
              <video
                key={v.socketId}
                data-socket={v.socketId}
                ref={(ref) => {
                  if (ref && v.stream) {
                    ref.srcObject = v.stream;
                  }
                }}
                autoPlay
                playsInline
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
