from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.device import Device
from app.schemas.device import DeviceCreate, DeviceUpdate, DeviceOut

router = APIRouter(prefix="/api/devices", tags=["Devices"])


@router.post("", response_model=DeviceOut)
def register_device(payload: DeviceCreate, db: Session = Depends(get_db)):
    device = Device(**payload.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.get("", response_model=List[DeviceOut])
def list_devices(
    tenant_id: Optional[int] = None,
    charging_status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Device)
    if tenant_id:
        q = q.filter(Device.tenant_id == tenant_id)
    if charging_status:
        q = q.filter(Device.charging_status == charging_status)
    if search:
        like = f"%{search}%"
        q = q.filter((Device.vin.like(like)) | (Device.make.like(like)) | (Device.model.like(like)))
    return q.order_by(Device.id.desc()).limit(1000).all()


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(device_id: int, db: Session = Depends(get_db)):
    device = db.query(Device).get(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    return device


@router.put("/{device_id}", response_model=DeviceOut)
def update_device(device_id: int, payload: DeviceUpdate, db: Session = Depends(get_db)):
    device = db.query(Device).get(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
    db.commit()
    db.refresh(device)
    return device
