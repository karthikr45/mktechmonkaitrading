from decimal import Decimal

from analytics.engine import backtest, ema, option_price, payoff, sma


def test_golden_indicators():
    values = [Decimal(i) for i in range(1, 6)]
    assert sma(values, 3) == [None, None, Decimal(2), Decimal(3), Decimal(4)]
    assert ema(values, 3) == [None, None, Decimal(2), Decimal(3), Decimal(4)]


def test_backtest_reproducibility_and_no_same_bar_fill():
    prices = [str(i) for i in [100, 101, 102, 103, 104, 106, 107, 108, 105, 102]]
    result = backtest(prices, 3)
    assert result == backtest(prices, 3)
    assert result["trades"][0]["index"] == 3
    assert Decimal(result["costs"]) > 0
    assert result["trades"][-1]["side"] == "SELL"


def test_put_call_parity():
    import math

    call = option_price(100, 100, 1, 0.05, 0.2, "call")
    put = option_price(100, 100, 1, 0.05, 0.2, "put")
    assert abs(call["price"] - 10.450583572185565) < 1e-8
    assert abs(call["price"] - put["price"] - (100 - 100 * math.exp(-0.05))) < 1e-8


def test_vertical_spread_payoff_decimal_exact():
    legs = [
        {
            "kind": "call",
            "side": "BUY",
            "strike": "100",
            "premium": "10.10",
            "quantity": 1,
        },
        {
            "kind": "call",
            "side": "SELL",
            "strike": "110",
            "premium": "4.05",
            "quantity": 1,
        },
    ]
    assert payoff("120", legs) == "3.95"
    assert payoff("90", legs) == "-6.05"
