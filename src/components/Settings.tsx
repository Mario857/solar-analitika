"use client";

import { useState, useEffect } from "react";
import { Config } from "@/lib/types";

interface SettingsProps {
  config: Config;
  onSave: (config: Config) => void;
  onReset: () => void;
}

const SAVE_FEEDBACK_DURATION_MS = 2000;

export default function Settings({ config, onSave, onReset }: SettingsProps) {
  const [localConfig, setLocalConfig] = useState<Config>({ ...config });
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setLocalConfig({ ...config });
  }, [config]);

  const updateField = <K extends keyof Config>(key: K, value: Config[K]) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(localConfig);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), SAVE_FEEDBACK_DURATION_MS);
  };

  const handleReset = () => {
    onReset();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), SAVE_FEEDBACK_DURATION_MS);
  };

  const isSingleTariff = localConfig.tariffModel === "single";

  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";
  const inputClasses = "bg-background border border-border rounded-sm px-3 py-2.5 text-text font-mono text-sm outline-none transition-all duration-150 w-full resize-y focus:border-amber focus:shadow-[0_0_0_2px_rgba(240,164,32,0.2)]";
  const labelClasses = "font-mono text-[0.65rem] font-medium uppercase tracking-wider text-text-dim";
  const fieldGroup = "flex flex-col gap-2";
  const unitClasses = "font-mono text-[0.6rem] text-text-dim mt-0.5";

  const singleTariffFields = (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
      <div className={fieldGroup}>
        <label className={labelClasses}>JT cijena</label>
        <input
          className={inputClasses}
          type="number"
          step="0.000001"
          value={localConfig.energyPriceSingleTariff}
          onChange={(e) => updateField("energyPriceSingleTariff", parseFloat(e.target.value) || 0)}
        />
        <span className={unitClasses}>€/kWh</span>
      </div>
      <div className={fieldGroup}>
        <label className={labelClasses}>Opskrbna nakn.</label>
        <input
          className={inputClasses}
          type="number"
          step="0.001"
          value={localConfig.supplyFee}
          onChange={(e) => updateField("supplyFee", parseFloat(e.target.value) || 0)}
        />
        <span className={unitClasses}>€/mj</span>
      </div>
      <div className={`${fieldGroup} justify-end`}>
        <label className={labelClasses}>
          <input
            type="checkbox"
            className="mr-1.5"
            checked={localConfig.solidarityDiscount}
            onChange={(e) => updateField("solidarityDiscount", e.target.checked)}
          />{" "}
          Popust solidarna
        </label>
      </div>
    </div>
  );

  const dualTariffFields = (
    <>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <div className={fieldGroup}>
          <label className={labelClasses}>VT</label>
          <input className={inputClasses} type="number" step="0.000001" value={localConfig.energyPriceHighTariff} onChange={(e) => updateField("energyPriceHighTariff", parseFloat(e.target.value) || 0)} />
        </div>
        <div className={fieldGroup}>
          <label className={labelClasses}>NT</label>
          <input className={inputClasses} type="number" step="0.000001" value={localConfig.energyPriceLowTariff} onChange={(e) => updateField("energyPriceLowTariff", parseFloat(e.target.value) || 0)} />
        </div>
        <div className={fieldGroup}>
          <label className={labelClasses}>Opskrbna</label>
          <input className={inputClasses} type="number" step="0.001" value={localConfig.supplyFee} onChange={(e) => updateField("supplyFee", parseFloat(e.target.value) || 0)} />
        </div>
        <div className={fieldGroup}>
          <label className={labelClasses}>
            <input type="checkbox" className="mr-1.5" checked={localConfig.solidarityDiscount} onChange={(e) => updateField("solidarityDiscount", e.target.checked)} />{" "}
            Popust sol.
          </label>
        </div>
      </div>
      <div className="font-mono text-[0.6rem] text-text-dim leading-normal mt-3">Zima VT 07–21 NT 21–07 | Ljeto VT 08–22 NT 22–08</div>
    </>
  );

  const tariffFields = isSingleTariff ? singleTariffFields : dualTariffFields;

  const singleTariffNetworkFields = (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
      <div className={fieldGroup}><label className={labelClasses}>Dist JT</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.distributionSingleTariff} onChange={(e) => updateField("distributionSingleTariff", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>Prij JT</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.transmissionSingleTariff} onChange={(e) => updateField("transmissionSingleTariff", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>Mjerna</label><input className={inputClasses} type="number" step="0.001" value={localConfig.meteringFee} onChange={(e) => updateField("meteringFee", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>Solidarna</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.solidarityRate} onChange={(e) => updateField("solidarityRate", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>OIE</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.renewableEnergyRate} onChange={(e) => updateField("renewableEnergyRate", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>PDV</label><input className={inputClasses} type="number" step="0.01" value={localConfig.vatRate} onChange={(e) => updateField("vatRate", parseFloat(e.target.value) || 0)} /></div>
    </div>
  );

  const dualTariffNetworkFields = (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
      <div className={fieldGroup}><label className={labelClasses}>Dist VT</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.distributionHighTariff} onChange={(e) => updateField("distributionHighTariff", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>Dist NT</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.distributionLowTariff} onChange={(e) => updateField("distributionLowTariff", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>Prij VT</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.transmissionHighTariff} onChange={(e) => updateField("transmissionHighTariff", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>Prij NT</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.transmissionLowTariff} onChange={(e) => updateField("transmissionLowTariff", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>Mjerna</label><input className={inputClasses} type="number" step="0.001" value={localConfig.meteringFee} onChange={(e) => updateField("meteringFee", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>Solidarna</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.solidarityRate} onChange={(e) => updateField("solidarityRate", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>OIE</label><input className={inputClasses} type="number" step="0.000001" value={localConfig.renewableEnergyRate} onChange={(e) => updateField("renewableEnergyRate", parseFloat(e.target.value) || 0)} /></div>
      <div className={fieldGroup}><label className={labelClasses}>PDV</label><input className={inputClasses} type="number" step="0.01" value={localConfig.vatRate} onChange={(e) => updateField("vatRate", parseFloat(e.target.value) || 0)} /></div>
    </div>
  );

  const networkFields = isSingleTariff ? singleTariffNetworkFields : dualTariffNetworkFields;
  const saveButtonLabel = isSaved ? "Spremljeno ✓" : "Spremi postavke";

  return (
    <>
      <div className={sectionBox}>
        <h3 className={sectionHeading}>HEP API</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div className={fieldGroup}>
            <label className={labelClasses}>Bearer token</label>
            <input className={inputClasses} type="password" value={localConfig.token} onChange={(e) => updateField("token", e.target.value)} placeholder="HEP API token..." autoComplete="off" />
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Broj mjernog mjesta</label>
            <input className={inputClasses} type="text" value={localConfig.meter} onChange={(e) => updateField("meter", e.target.value)} />
          </div>
        </div>
      </div>

      <div className={sectionBox}>
        <h3 className={sectionHeading}>FusionSolar (Huawei)</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div className={fieldGroup}>
            <label className={labelClasses}>Cookie (cijeli string)</label>
            <textarea className={inputClasses} rows={3} value={localConfig.fusionSolarCookie} onChange={(e) => updateField("fusionSolarCookie", e.target.value)} placeholder="JSESSIONID=...;HWWAFSESID=...;SSO_TGC_=..." />
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Station DN</label>
            <input className={inputClasses} type="text" value={localConfig.fusionSolarStation} onChange={(e) => updateField("fusionSolarStation", e.target.value)} />
            <span className={unitClasses}>API proxy ugrađen u Next.js — nije potreban zasebni proxy.py</span>
          </div>
        </div>
      </div>

      <div className={sectionBox}>
        <h3 className={sectionHeading}>Tarifni model</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-4">
          <div className={fieldGroup}>
            <label className={labelClasses}>Model</label>
            <select className={inputClasses} value={localConfig.tariffModel} onChange={(e) => updateField("tariffModel", e.target.value as "single" | "dual")}>
              <option value="single">HEPI Plavi (jednotarifni)</option>
              <option value="dual">HEPI Bijeli (dvotarifni)</option>
            </select>
          </div>
        </div>
        {tariffFields}
      </div>

      <div className={sectionBox}>
        <h3 className={sectionHeading}>Mreža i naknade (bez PDV-a)</h3>
        {networkFields}
      </div>

      <div className="flex gap-3 flex-wrap mt-4 sm:mt-6">
        <button className="bg-amber text-background border-none rounded-sm px-6 py-2.5 font-body text-sm font-bold cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-[#f5b030] hover:-translate-y-px active:translate-y-0" onClick={handleSave}>{saveButtonLabel}</button>
        <button className="bg-transparent border border-border text-text rounded-sm px-6 py-2.5 font-body text-sm font-bold cursor-pointer transition-all duration-150 whitespace-nowrap hover:border-amber hover:text-amber hover:bg-transparent" onClick={handleReset}>Vrati zadano</button>
      </div>
    </>
  );
}
