const CameraManager = (function () {

    let sharedStream = null;
    let videoElement = null;
    let isReady = false;
    let onReadyCallbacks = [];

    async function startCamera(videoConstraints) {
        if (sharedStream !== null) {
            return sharedStream;
        }

        try {
            sharedStream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints || {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user"
                },
                audio: false
            });
        } catch (error) {
            sharedStream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints || true,
                audio: false
            });
        }

        videoElement = document.getElementById("shared-camera-feed");
        if (!videoElement) {
            videoElement = document.createElement("video");
            videoElement.id = "shared-camera-feed";
            videoElement.setAttribute("autoplay", "");
            videoElement.setAttribute("playsinline", "");
            videoElement.setAttribute("muted", "");
            videoElement.style.position = "absolute";
            videoElement.style.top = "-9999px";
            videoElement.style.left = "-9999px";
            videoElement.style.width = "1px";
            videoElement.style.height = "1px";
            document.body.appendChild(videoElement);
        }

        videoElement.srcObject = sharedStream;

        await new Promise(function (resolve) {
            function completePlay() {
                videoElement.play().then(function () {
                    resolve();
                }).catch(function () {
                    resolve();
                });
            }

            if (videoElement.readyState >= 1) {
                completePlay();
            } else {
                videoElement.onloadedmetadata = function () {
                    completePlay();
                };
                videoElement.onloadeddata = function () {
                    completePlay();
                };
                setTimeout(function () {
                    completePlay();
                }, 800);
            }
        });

        isReady = true;

        for (let i = 0; i < onReadyCallbacks.length; i++) {
            onReadyCallbacks[i](videoElement, sharedStream);
        }
        onReadyCallbacks = [];

        return sharedStream;
    }

    function getVideoElement() {
        return videoElement;
    }

    function getStream() {
        return sharedStream;
    }

    function onReady(callback) {
        if (isReady) {
            callback(videoElement, sharedStream);
        } else {
            onReadyCallbacks.push(callback);
        }
    }

    function stopCamera() {
        if (sharedStream) {
            const tracks = sharedStream.getTracks();
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].stop();
            }
            sharedStream = null;
            isReady = false;
        }
    }

    return {
        startCamera: startCamera,
        getVideoElement: getVideoElement,
        getStream: getStream,
        onReady: onReady,
        stopCamera: stopCamera
    };

})();
