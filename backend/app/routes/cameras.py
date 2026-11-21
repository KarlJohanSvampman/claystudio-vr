from fastapi import APIRouter
import cv2

router = APIRouter(prefix="/cameras", tags=["camera"])

@router.get("")
def list_cameras(max_index: int = 5):
    devices = []
    for index in range(max(0, min(max_index, 12))):
        cap = cv2.VideoCapture(index)
        if cap.isOpened():
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            devices.append({
                "id": index,
                "label": f"Camera {index}",
                "width": width,
                "height": height,
            })
        cap.release()
    return {"devices": devices}
