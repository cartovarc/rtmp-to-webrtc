const NodeMediaServer = require('node-media-server');
const express = require('express');
const bodyParser = require('body-parser');
const ffmpeg = require('fluent-ffmpeg');
const MediaServer = require('./mediaserver');

const app = express();

// need change is ip address
const mediaserver = new MediaServer('127.0.0.1');


app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static('./'));


const baseRtmpUrl = 'rtmp://127.0.0.1/live/';

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get('/test', async (req, res) => {
    res.send('hello world')
})

app.post('/watch/:stream', async (req, res) => {

    console.log('request body', req.body);

    let stream = req.params.stream;
    let offer = req.body.offer;

    // // If we did handle the stream yet
    if (!mediaserver.getStream(stream)) {
        await mediaserver.createStream(stream, baseRtmpUrl + stream);
    }

    let answer = await mediaserver.offerStream(stream, offer);
    console.log('answer', answer);
    res.json({answer:answer});
})

let port_server = process.env.npm_package_config_PortServer || 4001

app.listen(port_server, function () {
    console.log('Example app listening on port ' + port_server);
    console.log('Open http://localhost:' + port_server);
})

let portRTMP = process.env.npm_package_config_PortRTMP || 1935

const config = {
    rtmp: {
        port: portRTMP,
        chunk_size: 1024,
        gop_cache: true,
        ping: 60,
        ping_timeout: 30
    }
};


const nms = new NodeMediaServer(config)

nms.on('postPublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

    let stream = StreamPath.split('/')[2]

    if(mediaserver.getStream(stream)) {
        mediaserver.removeStream(stream);
    }

});



nms.run();


// now we need simulate a rtmp stream 

/*

ffmpeg -f lavfi -re -i color=black:s=640x480:r=15 -filter:v "drawtext=text='%{localtime\:%T}':fontcolor=white:fontsize=80:x=20:y=20" -vcodec libx264 -tune zerolatency -preset ultrafast -g 15 -keyint_min 15 -profile:v baseline -level 3.0 -pix_fmt yuv420p -r 15 -f flv rtmp://localhost/live/live

*/




