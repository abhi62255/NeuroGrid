from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tariff import Tariff, TouSchedule
from app.schemas.tariff import TariffCreate, TariffOut
from app.services import tariff_service

router = APIRouter(prefix="/api/tariffs", tags=["Tariffs"])


@router.post("", response_model=TariffOut)
def create_tariff(payload: TariffCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"tou_schedules"})
    tariff = Tariff(**data)
    db.add(tariff)
    db.flush()

    for sched in payload.tou_schedules:
        db.add(TouSchedule(tariff_id=tariff.id, **sched.model_dump()))

    db.commit()
    db.refresh(tariff)
    return tariff


@router.get("", response_model=List[TariffOut])
def list_tariffs(tenant_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Tariff)
    if tenant_id:
        q = q.filter(Tariff.tenant_id == tenant_id)
    return q.all()


@router.get("/current/{tenant_id}")
def current_price(tenant_id: int, db: Session = Depends(get_db)):
    return tariff_service.get_current_price_info(db, tenant_id)


@router.get("/{tariff_id}", response_model=TariffOut)
def get_tariff(tariff_id: int, db: Session = Depends(get_db)):
    tariff = db.query(Tariff).get(tariff_id)
    if not tariff:
        raise HTTPException(404, "Tariff not found")
    return tariff
