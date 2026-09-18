from decimal import Decimal, localcontext
from math import erf, exp, log, sqrt


def sma(values: list[Decimal], period: int) -> list[Decimal | None]:
    if period < 1:
        raise ValueError("period must be positive")
    return [
        None if i + 1 < period else sum(values[i - period + 1 : i + 1]) / period
        for i in range(len(values))
    ]


def ema(values: list[Decimal], period: int) -> list[Decimal | None]:
    if period < 1:
        raise ValueError("period must be positive")
    output: list[Decimal | None] = [None] * len(values)
    if len(values) < period:
        return output
    current = sum(values[:period]) / period
    output[period - 1] = current
    alpha = Decimal(2) / (period + 1)
    for i in range(period, len(values)):
        current = alpha * values[i] + (1 - alpha) * current
        output[i] = current
    return output


def backtest(
    prices: list[str],
    period: int = 5,
    initial: str = "1000000",
    fee_bps: str = "5",
    slippage_bps: str = "2",
) -> dict:
    if len(prices) < period + 2:
        raise ValueError("insufficient sample")
    values = [Decimal(p) for p in prices]
    if any(v <= 0 or not v.is_finite() for v in values):
        raise ValueError("prices must be finite and positive")
    cash = Decimal(initial)
    if cash <= 0 or Decimal(fee_bps) < 0 or Decimal(slippage_bps) < 0:
        raise ValueError("invalid capital or costs")
    indicators = sma(values, period)
    fee_rate = Decimal(fee_bps) / 10000
    slip = Decimal(slippage_bps) / 10000
    quantity = 0
    trades = []
    equity = []
    costs = Decimal(0)
    peak = cash
    max_dd = Decimal(0)
    for i, price in enumerate(values):
        # A close-derived signal only executes on the following observation.
        if i > 0 and indicators[i - 1] is not None:
            desired = values[i - 1] > indicators[i - 1]
            if desired and quantity == 0 and i < len(values) - 1:
                fill = price * (1 + slip)
                if cash >= fill * (1 + fee_rate):
                    quantity = 1
                    fee = fill * fee_rate
                    cash -= fill + fee
                    costs += fee + price * slip
                    trades.append(
                        {"index": i, "side": "BUY", "price": str(fill), "fee": str(fee)}
                    )
            elif (not desired or i == len(values) - 1) and quantity:
                fill = price * (1 - slip)
                fee = fill * fee_rate
                cash += fill - fee
                costs += fee + price * slip
                quantity = 0
                trades.append(
                    {"index": i, "side": "SELL", "price": str(fill), "fee": str(fee)}
                )
        value = cash + quantity * price
        peak = max(peak, value)
        max_dd = max(max_dd, (peak - value) / peak)
        equity.append(str(value.quantize(Decimal("0.01"))))
    return {
        "manifest": {
            "engine": "event-close-v1",
            "strategy": f"sma-{period}-v1",
            "dataVersion": "caller-supplied",
            "execution": "next-observation",
            "feeBps": fee_bps,
            "slippageBps": slippage_bps,
        },
        "equity": equity,
        "trades": trades,
        "returnPct": str(
            ((cash / Decimal(initial) - 1) * 100).quantize(Decimal("0.0001"))
        ),
        "maxDrawdownPct": str((max_dd * 100).quantize(Decimal("0.0001"))),
        "costs": str(costs.quantize(Decimal("0.01"))),
        "warnings": [
            "Research only; one-unit positions",
            "Insufficient sample for investment conclusions",
            "No real market entitlement implied",
        ],
    }


def option_price(
    spot: float, strike: float, years: float, rate: float, volatility: float, kind: str
) -> dict:
    if min(spot, strike, years, volatility) <= 0 or kind not in ("call", "put"):
        raise ValueError("positive inputs and call/put required")

    # Black-Scholes, European exercise, continuous rate, no dividends.
    def n(x):
        return (1 + erf(x / sqrt(2))) / 2

    d1 = (log(spot / strike) + (rate + volatility**2 / 2) * years) / (
        volatility * sqrt(years)
    )
    d2 = d1 - volatility * sqrt(years)
    density = exp(-d1 * d1 / 2) / sqrt(2 * 3.141592653589793)
    call = spot * n(d1) - strike * exp(-rate * years) * n(d2)
    put = strike * exp(-rate * years) * n(-d2) - spot * n(-d1)
    return {
        "price": call if kind == "call" else put,
        "delta": n(d1) if kind == "call" else n(d1) - 1,
        "gamma": density / (spot * volatility * sqrt(years)),
        "vegaPerOnePercent": spot * density * sqrt(years) / 100,
        "assumptions": "European, no dividends, constant volatility; theoretical floats, not settlement amounts",
    }


def payoff(spot: str, legs: list[dict]) -> str:
    with localcontext() as ctx:
        ctx.prec = 28
        s = Decimal(spot)
        total = Decimal(0)
        for leg in legs:
            strike, premium = Decimal(leg["strike"]), Decimal(leg["premium"])
            intrinsic = max(
                Decimal(0), s - strike if leg["kind"] == "call" else strike - s
            )
            total += (
                (intrinsic - premium)
                * int(leg["quantity"])
                * (1 if leg["side"] == "BUY" else -1)
            )
        return str(total.quantize(Decimal("0.01")))
