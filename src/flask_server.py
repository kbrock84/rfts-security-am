import eventlet
eventlet.monkey_patch()

from flask import Flask
from flask_socketio import SocketIO, emit
import time

import pyrealsense2 as rs
import base64
import numpy as np
import json
import cv2
import sys
import imutils




global pl
global pl_running
pl_running = False

app = Flask(__name__)
soc = SocketIO(app, cors_allowed_origins='*')

def broadcast_frames():    
    print('starting to broadcast frames')
    try:
        while True:
            frames = pl.wait_for_frames()
            color_frame = frames.get_color_frame()
            
            img = np.asanyarray(color_frame.get_data())
            img = imutils.rotate(img, 180)

            retval, buffer = cv2.imencode('.jpg', img)
            img64 = 'data:image/jpg;base64,' + \
                base64.b64encode(buffer).decode('utf8')

            soc.emit('jpg', img64, broadcast=True)
            eventlet.sleep(0.1)

    except:
        print('oops!!!')
        print(sys.exc_info()[0])



@soc.on('start_rs_pipeline', namespace='/')
def handle_start():
    print('init connection')
    global pl_running
    if(not pl_running):
        pl_running = True
        eventlet.spawn(broadcast_frames)
    return

if __name__ == "__main__":

    pl = rs.pipeline()

    config = rs.config()
    config.enable_stream(rs.stream.color, 1920, 1080, rs.format.bgr8, 30)
    #config.enable_stream(rs.stream.infrared, 640, 480, rs.format.y8, 30)
    
    pl.start(config)
    print("starting")

    #soc.start_background_task(target=broadcast_frames)
    try:
        soc.run(app, host="0.0.0.0", port=9999)
    finally:
        print('stopped')
        pl.stop()
    

    
    