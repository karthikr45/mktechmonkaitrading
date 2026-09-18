from fastapi.testclient import TestClient

from analytics.main import app

client = TestClient(app)


def test_invalid_prices_do_not_crash_service():
    for prices in [["NaN", "12"], ["-1", "12"], ["text", "12"]]:
        assert client.post("/v1/indicators", json={"prices": prices}).status_code == 422


def test_option_validation():
    response = client.post(
        "/v1/options/price",
        json={
            "spot": 100,
            "strike": 100,
            "years": 1,
            "rate": 0.05,
            "volatility": 0.2,
            "kind": "call",
        },
    )
    assert response.status_code == 200
    assert 10 < response.json()["price"] < 11


def test_payoff_api_uses_decimal_strings():
    response = client.post(
        "/v1/options/payoff",
        json={
            "spot": "120",
            "legs": [
                {
                    "strike": "100",
                    "premium": "10.10",
                    "quantity": 1,
                    "kind": "call",
                    "side": "BUY",
                }
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["payoff"] == "9.90"
