from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.whatsapp_bot import handle_whatsapp_bot_message

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


class WhatsAppBotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_: str = Field(min_length=3)
    body: str = Field(min_length=1)
    profile_name: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _map_from_field(cls, value):
        if isinstance(value, dict) and "from" in value and "from_" not in value:
            copied = dict(value)
            copied["from_"] = copied.pop("from")
            return copied
        return value


class WhatsAppBotResponse(BaseModel):
    reply: str


@router.post("/bot", response_model=WhatsAppBotResponse)
def whatsapp_bot(
    payload: WhatsAppBotRequest,
    db: Session = Depends(get_db),
):
    reply = handle_whatsapp_bot_message(
        db,
        wa_from=payload.from_,
        body=payload.body,
        profile_name=payload.profile_name,
    )
    return {"reply": reply}
