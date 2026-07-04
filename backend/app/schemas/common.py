from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict


class TenantBase(BaseModel):
    name: str
    region: Optional[str] = None
    timezone: str = "UTC"


class TenantCreate(TenantBase):
    pass


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None
    timezone: Optional[str] = None
    status: Optional[str] = None


class TenantOut(TenantBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_uid: str
    status: str
    created_at: datetime


class UserBase(BaseModel):
    name: str
    email: EmailStr
    role: str = "operator"


class UserCreate(UserBase):
    tenant_id: int


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    created_at: datetime
