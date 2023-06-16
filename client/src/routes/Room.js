/* Group Video Chat Code */
import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import Peer from "simple-peer";
import styled from "styled-components";

const Container = styled.div`
    padding: 20px;
    display: flex;
    height: 100vh;
    width: 90%;
    margin: auto;
    flex-wrap: wrap;
`;

const StyledVideo = styled.video`
    height: 40%;
    width: 50%;
`;

const Video = (props) => {
    const ref = useRef();

    useEffect(() => {
        props.peer.on("stream", stream => {
            ref.current.srcObject = stream;
        })
    }, []);

    return (
        <StyledVideo playsInline autoPlay ref={ref} />
    );
}


const videoConstraints = {
    height: window.innerHeight / 2,
    width: window.innerWidth / 2
};

const Room = (props) => {
    const [peers, setPeers] = useState([]);
    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]); /* Array of Peers(실제 Peer Object의 SocketId) */
    const roomID = props.match.params.roomID;

    useEffect(() => {
        socketRef.current = io.connect("/"); // 접속시
        navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true }).then(stream => {
           userVideo.current.srcObject = stream; // own video
           socketRef.current.emit("join room");  // 방에 참여 : 내가 initiator
           socketRef.current.on("all users", users => { // 현재 방의 모든 유저들을 서버가 돌려줌
            const peers = []; // 방금 들어왔기 때문에 peer가 없음
            users.forEach(userID => { 
                const peer = createPeer(userID, socketRef.current.id, stream); // 나의 id와 stream
                peersRef.current.push({
                    peerID : userID, // 방금 peer를 만든사람(내가 아님)의 peerID
                    peer,
                })
                peers.push(peer); // 1. peersRef : 실제 peer의 컬렉션 2. peers : 렌더링 목적을 위해 존재(state)  
            })
             setPeers(peers);
           })
        /* 위는 내가 방에 새로 join했을 경우임 */

        /* 이미 방에 있는 사람이 다른 사람의 join을 notify받음 : user joined 이벤트 */
        socketRef.current.on("user joined", payload => {
            const peer = addPeer(payload.signal, payload.callerID, stream); // join한 새로운 사람의 시그널과 아이디
            peersRef.current.push({ // 이미 존재하는 peersRef에 새로운 peer를 더함
                peerID : payload.callerID,
                peer,
            })

            setPeers(users => [...users, peer]); // 렌더링을 위해서도 더해줌
        })

        /* 방금 join한 사람은 returned signal을 받음(addPeer 에서 리턴해줌) */
        /* signal을 사람들에게 보내고, 이를 돌려받았으니 제대로 된 peer에게 signal했는지를 확인해야 함 
            그리고 아직 connection을 설정하지 않은 사람과만 connection만듬
            : 내가 시그널 보냄 -> 그들이 받고 accept하고 돌려줌 -> 나도 accept함??
        */
        socketRef.current.on("receiving returned signal", payload => {
            const item = peersRef.current.find(p => p.peerID === payload.id);
            item.peer.signal(payload.signal);
        })
    })
    }, []);


    function createPeer(userToSignal, callerID, stream) {
       const peer = new Peer({
        initiator : true, // 내가 방에 들어갔기때문에, 다른 사람들에게 내가 join했어! 라고 말해야 함
        // initiator가 true이기 때문에 peer가 만들어지고 바로 signal을 emit : 이를 통해 사람들에게 바로 시그널 보낼 수 있음
        trickle   : false,
        stream,
       });

       peer.on("signal", signal => { 
        socketRef.current.emit("sending signal", { userToSignal , callerID, signal }) // 보낼사람, 나, 데이터(스트림)
        // signal을 서버에게 emit함
       })

       return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
       const peer = new Peer({
        initiator : false, // initiator가 false면 signal이벤트는 signal을 다른사람으로부터 받을때만 발동됨
        trickle : false,
        stream,
       });

       peer.on("signal", signal => { // initiator가 false이기 때문에, signal 이벤트는 peer가 만들어졌을때 발동x
        // 오히려, 누군가가 offer를 할때 signal이 발동됨
        socketRef.current.emit("returning signal", {signal, callerID}) // 서버에게 시그널을 돌려줌
       });

       peer.signal(incomingSignal); // accepting incoming signal -> 바로 위의 이벤트 발동 시킴

       return peer;
    }

    return (
        <Container>
            <StyledVideo muted ref={userVideo} autoPlay playsInline />
            {peers.map((peer, index) => {
                return (
                    <Video key={index} peer={peer} />
                );
            })}
        </Container>
    );
};

export default Room;
