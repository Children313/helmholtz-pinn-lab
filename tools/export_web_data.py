from __future__ import annotations

import json
from pathlib import Path

import numpy as np


APP_DIR = Path(__file__).resolve().parents[1]
ROOT = APP_DIR.parent
PINN_DIR = ROOT / "pinn_3.3"
OUT = APP_DIR / "src" / "data" / "web-data.json"


def load_npz(name: str):
    return np.load(PINN_DIR / name, allow_pickle=True)


def arr(value):
    return np.asarray(value).tolist()


def scalar(value):
    return float(np.asarray(value).reshape(-1)[0])


def main() -> None:
    processed = load_npz("processed_data.npz")
    pred = load_npz("pinn_predictions.npz")
    param = load_npz("pinn_parametric_v2_results.npz")
    offaxis = load_npz("offaxis_validation_results.npz")
    biot = load_npz("biot_savart_results.npz")
    sup = np.load(PINN_DIR / "results" / "ajp_superposition_axis_data.npz", allow_pickle=True)

    payload = {
        "meta": {
            "title": "基于物理信息神经网络的亥姆霍兹线圈三维磁场重建",
            "subtitle": "37 个轴线实测点 + Maxwell 物理约束 + 参数化 PINN",
            "kh": scalar(processed["KH"]),
            "radiusMm": 100,
            "turns": 500,
            "hallCurrentMa": 5,
            "coilCurrentMa": 500,
            "metrics": {
                "helmAxisMeanErr": scalar(pred["helm_mean_err"]),
                "singleAxisMeanErr": scalar(pred["single_mean_err"]),
                "paramUnseenMeanErr": scalar(param["mean_err_t3"]),
                "paramUnseenR2": scalar(param["r2_t3"]),
                "superpositionMeanErr": scalar(sup["mean_relative_error_percent"]),
                "biotSavartHeldoutErr": scalar(param["err_bs_t3"]),
            },
        },
        "axis": {
            "xMm": arr(processed["x_mm"]),
            "singleMeasured": arr(processed["B_t1"]),
            "halfMeasured": arr(processed["B_t2"]),
            "helmMeasured": arr(processed["B_t3"]),
            "doubleMeasured": arr(processed["B_t4"]),
            "helmPinn": arr(pred["Bx_pred_helm"]),
            "singlePinn": arr(pred["Bx_pred_single"]),
            "paramHalfPinn": arr(param["Bx_t2_pred"]),
            "paramHelmPinn": arr(param["Bx_t3_pred"]),
            "paramDoublePinn": arr(param["Bx_t4_pred"]),
            "biotSingle": arr(biot["B_single_num"]),
            "biotHelm": arr(biot["B_helm_num"]),
        },
        "parametric": {
            "errHalf": arr(param["err_t2"]),
            "errHelm": arr(param["err_t3"]),
            "errDouble": arr(param["err_t4"]),
            "meanErrHalf": scalar(param["mean_err_t2"]),
            "meanErrHelm": scalar(param["mean_err_t3"]),
            "meanErrDouble": scalar(param["mean_err_t4"]),
            "r2Half": scalar(param["r2_t2"]),
            "r2Helm": scalar(param["r2_t3"]),
            "r2Double": scalar(param["r2_t4"]),
            "calibratedCurrentA": scalar(param["I_calib"]),
        },
        "superposition": {
            "xMm": arr(sup["x_mm"]),
            "measured": arr(sup["B_helm_measured"]),
            "predicted": arr(sup["B_superposition"]),
            "relativeError": arr(sup["relative_error_percent"]),
        },
        "offaxis": {
            "xMm": arr(offaxis["x_radial_mm"]),
            "yMm": arr(offaxis["y_vals"]),
            "helm": {
                "measured20": arr(offaxis["B_meas_hm20"]),
                "pinn20": arr(offaxis["PINN_hm20"]),
                "bs20": arr(offaxis["BS_hm20"]),
                "measured40": arr(offaxis["B_meas_hm40"]),
                "pinn40": arr(offaxis["PINN_hm40"]),
                "bs40": arr(offaxis["BS_hm40"]),
                "measured60": arr(offaxis["B_meas_hm60"]),
                "pinn60": arr(offaxis["PINN_hm60"]),
                "bs60": arr(offaxis["BS_hm60"]),
            },
        },
        "fieldMap": {
            "xMm": arr(biot["x_grid_mm"]),
            "yMm": arr(biot["y_grid_mm"]),
            "bMag": arr(biot["B_mag_2d_grid"]),
            "bx": arr(biot["Bx_2d_grid"]),
            "by": arr(biot["By_2d_grid"]),
        },
    }

    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
