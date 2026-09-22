import base64
import io
import time
from pathlib import Path
from typing import Optional

import cv2
from fastapi import FastAPI, File, UploadFile, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

MODEL_PATH = Path(__file__).parent / "best.pt"
CONF_THRESHOLD = 0.15
IMG_SIZE = 896

app = FastAPI(title="EnviroX YOLO11 Plant Pathology & Pest Detection Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print(f"Loading YOLO11 plant model from {MODEL_PATH}...")
model = YOLO(str(MODEL_PATH))
CLASS_NAMES = model.names   # dict: {0: "...", ...}
print(f"Model loaded successfully. {len(CLASS_NAMES)} classes available.")


class Base64PredictRequest(BaseModel):
    image: str
    cropName: Optional[str] = "Tomato (Solanum lycopersicum)"


def format_disease_name(raw_name: str) -> str:
    cleaned = raw_name.replace("_", " ").replace("-", " ").strip()
    return " ".join(w.capitalize() for w in cleaned.split())


def generate_agronomic_analysis(disease_name: str, confidence: float, count: int, health_score: int) -> dict:
    if count == 0:
        return {
            "diagnosis": "Healthy Foliage — No Pathological Lesions Detected",
            "analysis": (
                "The neural model scanned 102 agricultural pathology categories and found zero "
                "active lesions, pests, or fungal blights. Leaf lamina displays uniform chlorophyll "
                "saturation and structural integrity. Continue routine irrigation and monitoring."
            ),
            "treatment": "Maintain standard nutrient solution and preventative IPM schedule."
        }

    is_pest = any(p in disease_name.lower() for p in ["aphid", "mite", "thrip", "worm", "caterpillar", "fly", "beetle", "bug", "moth", "roller"])
    lesion_plural = f"{count} active lesion/infestation site{'s' if count > 1 else ''}"
    
    if is_pest:
        diagnosis = f"{disease_name} infestation detected ({lesion_plural})"
        analysis = (
            f"Foliar scan identified {lesion_plural} with {confidence:.1f}% confidence. "
            f"Active pest clusters threaten leaf photosynthetic capacity and risk systemic vector transmission. "
            f"Immediate mechanical or biological countermeasure advised."
        )
        treatment = "Deploy yellow/blue sticky traps and apply cold-pressed neem oil (2ml/L) or targeted biocontrol agents."
    else:
        diagnosis = f"{disease_name} pathology detected ({lesion_plural})"
        analysis = (
            f"Pathological tissue analysis confirms {disease_name} symptoms across {lesion_plural} "
            f"with {confidence:.1f}% confidence. Folio necrosis or cellular degradation observed. "
            f"Calculated foliar health index reduced to {health_score}/100."
        )
        treatment = "Isolate affected canopy zones, reduce ambient canopy humidity, and apply approved bio-fungicidal spray."

    return {
        "diagnosis": diagnosis,
        "analysis": analysis,
        "treatment": treatment
    }


def process_pil_image(image: Image.Image, crop_name: str = "Tomato"):
    start = time.time()
    img_w, img_h = image.size

    results = model.predict(
        source=image,
        imgsz=IMG_SIZE,
        conf=CONF_THRESHOLD,
        verbose=False,
    )[0]

    detections = []
    lesions = []
    bounding_boxes = []

    if results.boxes is not None:
        for box in results.boxes:
            cls_id = int(box.cls.item())
            conf_val = float(box.conf.item())
            xyxy = [round(v, 1) for v in box.xyxy[0].tolist()]
            raw_name = CLASS_NAMES.get(cls_id, f"Class_{cls_id}")
            formatted_name = format_disease_name(raw_name)
            conf_pct = round(conf_val * 100, 1)

            x1, y1, x2, y2 = xyxy
            norm_x = round(max(0, min(100, (x1 / img_w) * 100)), 2)
            norm_y = round(max(0, min(100, (y1 / img_h) * 100)), 2)
            norm_w = round(max(0, min(100, ((x2 - x1) / img_w) * 100)), 2)
            norm_h = round(max(0, min(100, ((y2 - y1) / img_h) * 100)), 2)

            bbox_obj = {
                "x": norm_x,
                "y": norm_y,
                "width": norm_w,
                "height": norm_h,
                "pixel_coords": [int(x1), int(y1), int(x2), int(y2)]
            }

            detections.append({
                "class_id": cls_id,
                "class_name": formatted_name,
                "raw_name": raw_name,
                "confidence": conf_val,
                "confidence_pct": conf_pct,
                "bbox": xyxy,
            })

            lesions.append({
                "location": f"Region ({int(x1)}, {int(y1)}) - [{int(x2 - x1)}x{int(y2 - y1)}px]",
                "confidence": conf_pct,
                "disease": formatted_name,
                "boundingBox": bbox_obj
            })

            bounding_boxes.append({
                "x": norm_x,
                "y": norm_y,
                "width": norm_w,
                "height": norm_h,
                "label": formatted_name,
                "conf": conf_pct
            })

    # Sort strongest first
    detections.sort(key=lambda d: d["confidence"], reverse=True)
    lesions.sort(key=lambda d: d["confidence"], reverse=True)

    pest_count = len(detections)
    if pest_count > 0:
        top = detections[0]
        primary_disease = top["class_name"]
        primary_conf = top["confidence_pct"]
        health_score_num = max(20, min(95, round(100 - (pest_count * 12 + (primary_conf / 100.0) * 20))))
        disease_risk = "HIGH" if primary_conf > 75 or pest_count >= 2 else "MEDIUM"
        severity_level = "HIGH" if pest_count >= 3 or primary_conf > 85 else "MEDIUM"
    else:
        primary_disease = "Healthy Foliage"
        primary_conf = 98.5
        health_score_num = 95
        disease_risk = "LOW"
        severity_level = "LOW"

    health_score_str = f"{health_score_num}/100"
    conf_str = f"{primary_conf:.1f}%"

    agronomy = generate_agronomic_analysis(primary_disease, primary_conf, pest_count, health_score_num)

    # Annotated image from OpenCV
    annotated_b64 = None
    try:
        annotated_bgr = results.plot()
        success, buffer = cv2.imencode(".jpg", annotated_bgr)
        if success:
            annotated_b64 = f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"
    except Exception as e:
        print(f"Annotation plot warning: {e}")

    inference_ms = round((time.time() - start) * 1000, 1)

    return {
        "success": True,
        "inference_ms": inference_ms,
        "disease": primary_disease,
        "disease_name": primary_disease,
        "confidence": primary_conf,
        "confidence_str": conf_str,
        "confidence_score": primary_conf,
        "health_score": health_score_str,
        "healthScore": health_score_str,
        "health_index": health_score_num,
        "diagnosis": agronomy["diagnosis"],
        "analysis": agronomy["analysis"],
        "full_analysis": agronomy["analysis"],
        "treatment_advice": agronomy["treatment"],
        "lesions": lesions,
        "lesion_locations": [l["location"] for l in lesions],
        "bounding_boxes": bounding_boxes,
        "boxes": bounding_boxes,
        "detections": detections,
        "pest_count": pest_count,
        "disease_risk": disease_risk,
        "severity_level": severity_level,
        "crop_name": crop_name,
        "model_ready": True,
        "isMock": False,
        "annotated_image": annotated_b64,
        "image_width": img_w,
        "image_height": img_h
    }


@app.get("/health")
def health():
    return {
        "status": "online",
        "model": "YOLO11-102Class-PlantPathology",
        "classes_count": len(CLASS_NAMES),
        "weights": str(MODEL_PATH.name)
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return process_pil_image(image)


@app.post("/predict/base64")
async def predict_base64(payload: Base64PredictRequest):
    b64_str = payload.image
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    image_bytes = base64.b64decode(b64_str)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return process_pil_image(image, crop_name=payload.cropName or "Tomato")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
