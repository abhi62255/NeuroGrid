from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tenant import Tenant
from app.schemas.common import TenantCreate, TenantUpdate, TenantOut

router = APIRouter(prefix="/api/tenants", tags=["Tenants"])


@router.post("", response_model=TenantOut)
def create_tenant(payload: TenantCreate, db: Session = Depends(get_db)):
    tenant = Tenant(**payload.model_dump())
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.get("", response_model=List[TenantOut])
def list_tenants(db: Session = Depends(get_db)):
    return db.query(Tenant).all()


@router.get("/{tenant_id}", response_model=TenantOut)
def get_tenant(tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).get(tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    return tenant


@router.put("/{tenant_id}", response_model=TenantOut)
def update_tenant(tenant_id: int, payload: TenantUpdate, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).get(tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    db.commit()
    db.refresh(tenant)
    return tenant
