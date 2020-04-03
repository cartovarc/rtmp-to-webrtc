
const getPort = require('get-port');
const medoozeMediaServer = require('medooze-media-server');
const format = require('string-format');
const execa = require('execa');
const SemanticSDP	= require('semantic-sdp');
const SDPInfo		= SemanticSDP.SDPInfo;
const MediaInfo		= SemanticSDP.MediaInfo;
const CandidateInfo	= SemanticSDP.CandidateInfo;
const DTLSInfo		= SemanticSDP.DTLSInfo;
const ICEInfo		= SemanticSDP.ICEInfo;
const StreamInfo	= SemanticSDP.StreamInfo;
const TrackInfo		= SemanticSDP.TrackInfo;
const Direction		= SemanticSDP.Direction;
const CodecInfo		= SemanticSDP.CodecInfo;

const videoPt = 96;
const audioPt = 100;
const videoCodec = 'h264';
const audioCodec = 'opus';

let videoPort = null;
let audioPort = null;


//const RTMP_TO_RTP = 'ffmpeg -fflags nobuffer -i rtmp://ali.wangxiao.eaydu.com/live_bak/x_100_rtc_test -vcodec copy -an -bsf:v h264_mp4toannexb -f rtp -payload_type {pt} rtp://127.0.0.1:{port}'


const RTMP_TO_RTP = "gst-launch-1.0 -v  rtmpsrc location=rtmp://localhost/live/{stream} ! flvdemux ! h264parse ! rtph264pay config-interval=-1 pt={pt} !  udpsink host=127.0.0.1 port={port}"

class MediaServer 
{
    constructor(publicIp)
    {
        this.endpoint = medoozeMediaServer.createEndpoint(publicIp);
        //medoozeMediaServer.enableDebug(true);
        //medoozeMediaServer.enableUltraDebug(true);
        
        this.streams = new Map();
    }

    getStream(streamName) 
    {
        return this.streams.get(streamName)
    }

    removeStream(streamName) 
    {

        stream = this.streams.get(streamName) 

        if (stream) {

            if (stream.videoStreamer) {
                stream.videoStreamer.stop()
            }

            if (stream.audioStreamer) {
                stream.audioStreamer.stop()
            }
        }

        this.streams.delete(streamName)

    }

    async createStream(streamName,rtmpUrl,rtp_video_port=null)
    {

        const videoStreamer = medoozeMediaServer.createStreamer();
        const audioStreamer = medoozeMediaServer.createStreamer();

        const video = new MediaInfo(streamName+':video','video');
        const audio = new MediaInfo(streamName+':audio','audio');

        //Add h264 codec
        video.addCodec(new CodecInfo(videoCodec,videoPt));
        audio.addCodec(new CodecInfo(audioCodec,audioPt));

	let use_rtmp = !rtp_video_port;

        if (use_rtmp) {
            videoPort = await this.getMediaPort();
            audioPort = await this.getMediaPort();
        }else{
            videoPort = rtp_video_port;
	    audioPort = await this.getMediaPort();
	}

	console.log(videoPort)
	console.log(audioPort)


        const videoSession = videoStreamer.createSession(video, {
	        local : {
                port: videoPort
            }
        });

        const audioSession = audioStreamer.createSession(audio, {
            local : {
                port: audioPort
            }
        });

        this.streams.set(streamName, {
            videoPort: videoPort,
            audioPort: audioPort,
            videoStreamer: videoStreamer,
            audioStreamer: audioStreamer,
            video:videoSession,
            audio:audioSession
        });

	if(use_rtmp){
	    let execute = null;
            execute = format(RTMP_TO_RTP, {stream:streamName, pt: videoPt, port: videoPort}); // rtmp_to_rtp
	    console.log('streamer ', execute);


	    const gst = execa.shell(execute);

	    gst.on('close', (code, signal) => {
		console.log('gst close', code, signal)
	    })

	    gst.on('exit', (code, signal) => {
		console.log(code, signal)
	    })
	}

	videoPort = null;
	audioPort = null;

    }
    async getMediaPort()
    {
        let port;
        while(true)
        {
            port = await getPort();
            if(port%2 != 0){
                break;
            }
        }
        return port;
    }
    async offerStream(streamName, offerStr)
    {
        let offer = SDPInfo.process(offerStr);
	//console.log("OFFER");
	//console.log(offer);
	//console.log("OFFER");
        const transport = this.endpoint.createTransport({
            dtls : offer.getDTLS(),
            ice : offer.getICE()
        });

        transport.setRemoteProperties({
            audio : offer.getMedia('audio'),
            video : offer.getMedia('video')
        });

        //Get local DTLS and ICE info
        const dtls = transport.getLocalDTLSInfo();
        const ice  = transport.getLocalICEInfo();

        //Get local candidates
        const candidates = this.endpoint.getLocalCandidates();

        let answer = new SDPInfo();

        answer.setDTLS(dtls);
        answer.setICE(ice);

        for (let i=0;i<candidates.length;++i)
        {
            answer.addCandidate(candidates[i]);
        }

        let audioOffer = offer.getMedia('audio');

        if (audioOffer) 
        {
            let  audio = new MediaInfo(audioOffer.getId(), 'audio');
            //Set recv only
            audio.setDirection(Direction.SENDONLY);
            //Add it to answer
            //answer.addMedia(audio);    
        }

        let videoOffer = offer.getMedia('video');

        let  video = new MediaInfo(videoOffer.getId(), 'video');
        let videocodec = videoOffer.getCodec(videoCodec);
        video.addCodec(videocodec);
        video.setDirection(Direction.SENDONLY);
        answer.addMedia(video);

        console.log('answer', answer);

        transport.setLocalProperties({
            audio : answer.getMedia('audio'),
            video : answer.getMedia('video')
        });

        const outgoingStream  = transport.createOutgoingStream({
            video: true,
            audio: false
        });

        let videoSession = this.streams.get(streamName).video

        videoSession.on('stopped', () => {
            
            transport.stop()
        })
        // now  we only attach video 
        outgoingStream.getVideoTracks()[0].attachTo(videoSession.getIncomingStreamTrack());

        const info = outgoingStream.getStreamInfo();

        answer.addStream(info);

        return answer.toString();
    }
}

module.exports = MediaServer;


