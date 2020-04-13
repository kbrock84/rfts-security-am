import React, { useEffect, useRef, useState } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import styled from "styled-components";
import io from "socket.io-client";

const MainWrapper = styled.div`
  display: flex;

  .controls-wrapper {
    display: flex;
    flex-direction: column;
  }
`;

const CaptureContainer = styled.div`
  width: 100%;
  overflow-x: scroll;
  white-space: nowrap;
`;

const DataViewer = styled.div`
  height: 300px;
  overflow-y: auto;
`;

const colorMap = {
  person: "#66fc03",
  path: "rgba(102, 252, 3, 0.6)",
  car: "#fc03e3",
  truck: "#00fffb",
  unknown: "#fff200",
  controlPoint: "#ff0000",
  regionLine: "#fff200",
};

const getPoint = (t, p1, p2, p3, p4) =>
  Math.pow(1 - t, 3) * p1 +
  3 * (1 - t) * Math.pow(t, 2) * p2 +
  3 * (1 - t) * Math.pow(t, 2) * p3 +
  Math.pow(t, 3) * p4;

const get4PointBezierCurvePoints = (
  { x1, y1, x2, y2, x3, y3, x4, y4 },
  length
) => {
  const pathPoints = [];
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const x = getPoint(t, x1, x2, x3, x4);
    const y = getPoint(t, y1, y2, y3, y4);
    pathPoints.push({ x: x, y: y });
  }
  return pathPoints;
};

const CamViewer = () => {
  const canvRef = useRef();
  const ctx = useRef();
  const ctxImg = useRef();
  const model = useRef();
  const capContainer = useRef();
  const isWorking = useRef(false);
  const dataContainer = useRef();
  const hasPerson = useRef(false);
  let peoplePathPoints = [];
  const shouldPredicAndAct = useRef(false);

  const triggerRegion = useRef({
    x1: 0,
    y1: 560,
    x2: 1200,
    y2: 600,
    x3: 1400,
    y3: 500,
    x4: 1920,
    y4: 500,
  });

  const drawControlPoint = (ctx, x, y) => {
    ctx.strokeStyle = colorMap.controlPoint;
    ctx.arc(x, y, 10, 0, Math.PI * 2);
  };

  const triggerCurve = useRef();
  triggerCurve.current = get4PointBezierCurvePoints(
    triggerRegion.current,
    1920
  );

  const drawTriggerRegion = (ctx, triggerCurve, triggerRegion) => {
    ctx.beginPath();
    drawControlPoint(ctx, triggerRegion.x2, triggerRegion.y2);
    drawControlPoint(ctx, triggerRegion.x3, triggerRegion.y3);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = colorMap.regionLine;
    for (let i = 0; i < triggerCurve.length; i++) {
      ctx.arc(triggerCurve[i].x, triggerCurve[i].y, 1, 0, Math.PI * 2);
    }

    ctx.stroke();
  };

  const isTriggerPoint = (pt, triggerCurve) => {
    const curvePoint = triggerCurve.find(
      (p) => Math.abs(Math.round(p.x) - Math.round(pt.x)) < 5
    );
    return curvePoint && curvePoint.y < pt.y;
  };

  let mid;
  let btm;
  const addPeoplePathPoints = (ctx, bbox) => {
    mid = bbox[0] + bbox[2] / 2;
    btm = bbox[1] + bbox[3];
    ctx.strokeStyle = colorMap.path;
    ctx.beginPath();
    ctx.arc(mid, btm, 6, 0, Math.PI * 2);
    ctx.stroke();
    peoplePathPoints.push({ x: mid, y: btm, initial: true });
  };

  let [x, y, w, h] = [0, 0, 0, 0];
  const drawBoundingBox = (ctx, bbox, predictionClass) => {
    [x, y, w, h] = bbox;
    ctx.strokeStyle = colorMap[predictionClass] || colorMap.unknown;
    ctx.fillStyle = colorMap[predictionClass] || colorMap.unknown;
    ctx.strokeRect(x, y, w, h);
    ctx.fillText(predictionClass, x, y);
  };

  let triggered;
  const drawPeoplePathPoints = (ctx) => {
    triggered = false;
    peoplePathPoints.forEach((point) => {
      ctx.strokeStyle = colorMap.path;
      if (isTriggerPoint(point, triggerCurve.current)) {
        ctx.strokeStyle = "red";
        triggered = true;
      }
      triggered = point.initial && triggered;
      point.initial = false;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
      ctx.stroke();
    });
    return triggered;
  };

  const handlePersonInPicture = (capContainer, imgSrc) => {
    var img = document.createElement("img");
    img.setAttribute("height", 200);
    img.setAttribute("width", 300);
    img.setAttribute("src", imgSrc);
    capContainer.appendChild(img);
  };

  const predictAndAct = (ev) => {
    model.current.detect(canvRef.current).then((predictions) => {
      drawTriggerRegion(
        ctx.current,
        triggerCurve.current,
        triggerRegion.current
      );

      predictions.forEach((p) => {
        if (p.class === "tv" || p.class === "oven" || p.class === "suitcase") {
          return;
        }

        if (p.class == "person") {
          addPeoplePathPoints(ctx.current, p.bbox);
        }

        drawBoundingBox(ctx.current, p.bbox, p.class);
      });

      if (drawPeoplePathPoints(ctx.current)) {
        handlePersonInPicture(capContainer.current, ev);
      }

      hasPerson.current = false;
      isWorking.current = false;
    });
  };

  useEffect(() => {
    ctx.current = canvRef.current.getContext("2d");
    ctx.current.font = "28px Ariel";
    ctx.current.lineWidth = 2;
    ctxImg.current = new Image();
    const socket = io("http://192.168.1.24:9999/");

    socket.emit("start_rs_pipeline");
    socket.on("jpg", (ev) => {
      if (!model.current) {
        return;
      }
      if (!isWorking.current) {
        isWorking.current = true;
        window.requestAnimationFrame(() => {
          ctxImg.current.src = ev;
          ctx.current.drawImage(ctxImg.current, 0, 0);

          if (shouldPredicAndAct.current) {
            predictAndAct(ev);
          } else {
            isWorking.current = false;
          }
        });
      }
    });
  }, []);

  useEffect(() => {
    console.log("loading coco...");
    cocoSsd.load({ base: "lite_mobilenet_v2" }).then((m) => {
      model.current = m;
      console.log("coco loaded");
    });
  }, []);

  const handleChange = (target, prop) => {
    triggerRegion.current[prop] = Number(target.value);
    triggerCurve.current = get4PointBezierCurvePoints(
      triggerRegion.current,
      1920
    );
  };

  return (
    <>
      <MainWrapper>
        <canvas height="1080" width="1920" ref={canvRef}></canvas>
        <div class="controls-wrapper">
          <label for="startLineY">Start height</label>
          <input
            type="number"
            id="startLineY"
            onChange={({ target }) => handleChange(target, "y1")}
          ></input>
          <label for="endLineY">End height</label>
          <input
            type="number"
            id="endLineY"
            onChange={({ target }) => handleChange(target, "y4")}
          ></input>

          <label for="controlPoint1X">cp1x</label>
          <input
            type="number"
            id="controlPoint2X"
            onChange={({ target }) => handleChange(target, "x2")}
          ></input>
          <label for="controlPoint1Y">cp1y</label>
          <input
            type="number"
            id="controlPoint2Y"
            onChange={({ target }) => handleChange(target, "y2")}
          ></input>

          <label for="controlPoint2X">cp2x</label>
          <input
            type="number"
            id="controlPoint3X"
            onChange={({ target }) => handleChange(target, "x3")}
          ></input>
          <label for="controlPoint2Y">cp2y</label>
          <input
            type="number"
            id="controlPoint3Y"
            onChange={({ target }) => handleChange(target, "y3")}
          ></input>
          <label for="shouldPredict">Should Predict</label>
          <input
            type="checkbox"
            id="shouldPredict"
            onChange={({ target }) =>
              (shouldPredicAndAct.current = target.checked)
            }
          />
        </div>
      </MainWrapper>
      <CaptureContainer id="frames" ref={capContainer}></CaptureContainer>
      <DataViewer ref={dataContainer}></DataViewer>
    </>
  );
};

export default CamViewer;
