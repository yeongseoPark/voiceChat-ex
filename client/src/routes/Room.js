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

/* 비디오 스트림을 받아와서 비디오를 플레이하는 컴포넌트(함수형 컴포넌트) 
   props는 컴포넌트의 속성을 나타내는 객체 : props.peer는 webRTC 연결을 나타낼 듯*/
const Audio = (props) => {
    const ref = useRef(); // 리액트의 Hook?? ref객체는 컴포넌트가 렌더링 될때마다 일관성을 유지하는 뮤터블한 객체
    // 얘가 <video> element 즉, styledVideo 컴포넌트에 대한 직접적인 참조를 제공함

    /* props.peer의 stream 이벤트 발생시, 해당 스트림을 비디오태그의 srcObject로 설정 */
    useEffect(() => { 
        props.peer.on("stream", stream => {
            ref.current.srcObject = stream; // ref.current는 StyledVideo 컴포넌트의 DOM엘리먼트 
                                            // -> ref가 물건 보관함의 키고, current가 물건 
        })
    }, []); // 빈 배열 [] 는 userEffect가 컴포넌트가 마운트될 때 한 번만 실행되게 함

    /* DOM엘리먼트는 웹페이지를 프로그래밍 언어가 사용할 수 있는 구조로 표현한 것 : HTML태그 = 노드 */

    return (
        <StyledVideo playsInline autoPlay ref={ref} />
    );
}

const videoConstraints = {
    height: window.innerHeight / 2,
    width: window.innerWidth / 2
};

/* Room 컴포넌트 */ 
const Room = (props) => {
    const [peers, setPeers] = useState([]); // 현재 방에 있는 모든 피어들
    const socketRef = useRef(); // 소켓을 참조 
    const userVideo = useRef(); // 사용자의 비디오 스트림참조
    const peersRef = useRef([]); /* Array of Peers(실제 Peer Object의 SocketId) */
    const roomID = props.match.params.roomID;

    /* useEffect는 컴포넌트가 렌더링 이후에 어떤 일을 수행해야 하는지를 말함  */
    useEffect(() => { // 얘가 effect 함수
        socketRef.current = io.connect("/"); // 현재 도메인의 루트에서 실행되는 Socket.IO서버에 연결해라
                                             // "/" 는 서버의 URL을 나타내는데, 서버가 다른 도메인에서 실행중이라면, 해당 도메인의 URL을 인자로 전달해야 함 

        /* getUserMedia가 스트림을 resolve하는 Promise 반환 */
        // navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true }).then(stream => {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
           userVideo.current.srcObject = stream; // own video
           socketRef.current.emit("join room");  // 소켓을 통해 "join room" 이벤트를 서버에 전달 => 방에 참여 : 내가 initiator 
           
           /* all users라는 이벤트를 listen, 이에 대한 핸들러 등록 : 해당 이벤트는 서버가 현재 방에 있는 모든 사용자를 클라이언트에게 알려줄 때 발생 */
           socketRef.current.on("all users", users => { // 현재 방의 모든 유저들을 서버가 돌려줌
            
            const peers = []; // 방금 들어왔기 때문에 peer가 없음

            /* 현재 방의 각 사용자에 대해..(나 빼고) */
            users.forEach(userID => { 
                const peer = createPeer(userID, socketRef.current.id, stream); // 다른 유저의 id, 나의 id와 stream : Peer생성
                peersRef.current.push({
                    peerID : userID, // 방금 peer를 만든사람(내가 아님)의 peerID
                    peer,
                })
                peers.push(peer); // 1. peersRef : 실제 peer의 컬렉션 2. peers : 렌더링 목적을 위해 존재(state)  
            })
             setPeers(peers); // peers에 새 피어가 추가된 peers 값 설정(렌더링)
           })
        /* 위는 내가 방에 새로 join했을 경우임 */

        /* 이미 방에 있는 사람이 다른 사람의 join을 notify받음 : user joined 이벤트 */
        socketRef.current.on("user joined", payload => {
            const peer = addPeer(payload.signal, payload.callerID, stream); // join한 새로운 사람의 시그널과 아이디
            peersRef.current.push({ // 이미 존재하는 peersRef에 새로운 peer를 더함
                peerID : payload.callerID,
                peer,
            })

            setPeers(users => [...users, peer]); // 렌더링을 위해서 현재 users에도 새 peer 더해줌
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
        initiator : true, // 내가 방에 들어갔기때문에, 다른 사람들에게 내가 join했어! 라고 말해야 함(내가 시작하는 사람)
        // initiator가 true이기 때문에 peer가 만들어지고 바로 signal을 emit : 이를 통해 사람들에게 바로 시그널 보낼 수 있음
        trickle   : false, // false로 해두면 trickle ICE를 끄고, 하나의 signal 이벤트를 받음 
        stream,
       });

       /* peer가 리모트 피어에게 시그널을 보내고 싶을때 fired. -> initiator가 true면 바로 발동됨 */
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

       /* initiator가 false이기 때문에 remote offer을 받았을때 fire됨 */
       peer.on("signal", signal => { // initiator가 false이기 때문에, signal 이벤트는 peer가 만들어졌을때 발동x
        // 오히려, 누군가가 offer를 할때 signal이 발동됨
        socketRef.current.emit("returning signal", {signal, callerID}) // 밑에서 한 시그널에 대한 답변이 돌아올거임, 그게 얘를 트리거
       });

       // 얘를 통해서 최종적으로 피어들끼리 직접적인 connection을 생성함
       peer.signal(incomingSignal); 

       return peer;
    }

    return (
        <Container>
            <StyledVideo muted ref={userVideo} autoPlay playsInline />
            {peers.map((peer, index) => {
                return (
                    <Video key={index} peer={peer} /> // 위에 있는 Audio 컴포넌트
                );
            })}
        </Container>
    );
};

export default Room;
