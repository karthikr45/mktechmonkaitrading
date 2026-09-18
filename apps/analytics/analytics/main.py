from decimal import Decimal
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .engine import backtest, ema, option_price, payoff, sma

app = FastAPI(title="MKTechMonk Research Analytics", version="0.1.0")


class Prices(BaseModel):
    prices: list[str] = Field(min_length=2, max_length=10000)
    period: int = Field(default=5, ge=2, le=200)


class Option(BaseModel):
    spot: float = Field(gt=0, allow_inf_nan=False)
    strike: float = Field(gt=0, allow_inf_nan=False)
    years: float = Field(gt=0, le=30, allow_inf_nan=False)
    rate: float = Field(ge=-1, le=1, allow_inf_nan=False)
    volatility: float = Field(gt=0, le=10, allow_inf_nan=False)
    kind: Literal["call", "put"]


class Leg(BaseModel):
    kind: Literal["call", "put"]
    side: Literal["BUY", "SELL"]
    strike: str = Field(pattern=r"^\d+(\.\d{1,4})?$")
    premium: str = Field(pattern=r"^\d+(\.\d{1,4})?$")
    quantity: int = Field(ge=1, le=100000)


class Payoff(BaseModel):
    spot: str = Field(pattern=r"^\d+(\.\d{1,4})?$")
    legs: list[Leg] = Field(min_length=1, max_length=20)


@app.get("/health")
def health():
    return {"status": "ok", "ai": "unavailable", "mode": "research"}


@app.post("/v1/indicators")
def indicators(body: Prices):
    try:
        values = [Decimal(p) for p in body.prices]
        if any(not p.is_finite() or p <= 0 for p in values):
            raise ValueError("positive finite prices required")
        return {
            "version": "indicators-v1",
            "sma": [
                str(x) if x is not None else None for x in sma(values, body.period)
            ],
            "ema": [
                str(x) if x is not None else None for x in ema(values, body.period)
            ],
        }
    except Exception as exc:
        raise HTTPException(422, "Invalid prices") from exc


@app.post("/v1/backtests")
def run_backtest(body: Prices):
    try:
        return backtest(body.prices, body.period)
    except Exception as exc:
        raise HTTPException(422, "Invalid data or insufficient sample") from exc


@app.post("/v1/options/price")
def price_option(body: Option):
    return option_price(**body.model_dump())


@app.post("/v1/options/payoff")
def strategy_payoff(body: Payoff):
    return {
        "payoff": payoff(body.spot, [x.model_dump() for x in body.legs]),
        "currency": "INR",
        "includesFees": False,
    }
