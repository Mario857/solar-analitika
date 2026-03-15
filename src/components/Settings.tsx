"use client";

import { useState, useEffect } from "react";
import { Config, SessionCredentials, TariffPeriod } from "@/lib/types";
import { DEFAULTS } from "@/lib/config";

interface SettingsProps {
  config: Config;
  credentials: SessionCredentials;
  onSave: (config: Config) => void;
  onReset: () => void;
  onCredentialsChange: (credentials: SessionCredentials) => void;
}

const SAVE_FEEDBACK_DURATION_MS = 2000;

export default function Settings({ config, credentials, onSave, onReset, onCredentialsChange }: SettingsProps) {
  const [localConfig, setLocalConfig] = useState<Config>({ ...config });
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setLocalConfig({ ...config });
  }, [config]);

  const updateField = <K extends keyof Config>(key: K, value: Config[K]) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateCredential = <K extends keyof SessionCredentials>(key: K, value: string) => {
    onCredentialsChange({ ...credentials, [key]: value });
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

  const updatePeriodField = <K extends keyof TariffPeriod>(index: number, key: K, value: TariffPeriod[K]) => {
    setLocalConfig((prev) => {
      const updated = [...prev.tariffHistory];
      updated[index] = { ...updated[index], [key]: value };
      return { ...prev, tariffHistory: updated };
    });
  };

  const handleAddPeriod = () => {
    const newPeriod: TariffPeriod = {
      validFrom: new Date().toISOString().slice(0, 10),
      label: "",
      tariffModel: localConfig.tariffModel,
      energyPriceSingleTariff: DEFAULTS.energyPriceSingleTariff,
      energyPriceHighTariff: DEFAULTS.energyPriceHighTariff,
      energyPriceLowTariff: DEFAULTS.energyPriceLowTariff,
      supplyFee: DEFAULTS.supplyFee,
      distributionSingleTariff: DEFAULTS.distributionSingleTariff,
      distributionHighTariff: DEFAULTS.distributionHighTariff,
      distributionLowTariff: DEFAULTS.distributionLowTariff,
      transmissionSingleTariff: DEFAULTS.transmissionSingleTariff,
      transmissionHighTariff: DEFAULTS.transmissionHighTariff,
      transmissionLowTariff: DEFAULTS.transmissionLowTariff,
      meteringFee: DEFAULTS.meteringFee,
      solidarityRate: DEFAULTS.solidarityRate,
      solidarityDiscount: DEFAULTS.solidarityDiscount,
      renewableEnergyRate: DEFAULTS.renewableEnergyRate,
      vatRate: DEFAULTS.vatRate,
    };
    setLocalConfig((prev) => ({
      ...prev,
      tariffHistory: [...prev.tariffHistory, newPeriod].sort((a, b) => a.validFrom.localeCompare(b.validFrom)),
    }));
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
  const saveButtonLabel = isSaved ? "Spremljeno \u2713" : "Spremi postavke";

  return (
    <>
      <div className={sectionBox}>
        <h3 className={sectionHeading}>HEP Mjerenja</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <div className={fieldGroup}>
            <label className={labelClasses}>Korisničko ime</label>
            <input className={inputClasses} type="text" value={credentials.hepUsername} onChange={(e) => updateCredential("hepUsername", e.target.value)} placeholder="mjerenje.hep.hr korisnik" autoComplete="off" />
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Lozinka</label>
            <input className={inputClasses} type="password" value={credentials.hepPassword} onChange={(e) => updateCredential("hepPassword", e.target.value)} placeholder="mjerenje.hep.hr lozinka" autoComplete="off" />
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Broj mjernog mjesta</label>
            <input className={inputClasses} type="text" value={localConfig.meter} onChange={(e) => updateField("meter", e.target.value)} />
          </div>
        </div>
        <details className="mt-3">
          <summary className={`${labelClasses} cursor-pointer hover:text-amber`}>Ručni Bearer token (alternativa)</summary>
          <div className="mt-2">
            <input className={inputClasses} type="password" value={localConfig.token} onChange={(e) => updateField("token", e.target.value)} placeholder="HEP API token..." autoComplete="off" />
            <span className={unitClasses}>Koristite ako auto-prijava ne radi</span>
          </div>
        </details>
      </div>

      <div className={sectionBox}>
        <h3 className={sectionHeading}>FusionSolar (Huawei)</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div className={fieldGroup}>
            <label className={labelClasses}>Korisničko ime</label>
            <input className={inputClasses} type="text" value={credentials.fusionSolarUsername} onChange={(e) => updateCredential("fusionSolarUsername", e.target.value)} placeholder="FusionSolar email ili korisnik" autoComplete="off" />
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Lozinka</label>
            <input className={inputClasses} type="password" value={credentials.fusionSolarPassword} onChange={(e) => updateCredential("fusionSolarPassword", e.target.value)} placeholder="FusionSolar lozinka" autoComplete="off" />
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Station DN</label>
            <input className={inputClasses} type="text" value={localConfig.fusionSolarStation} onChange={(e) => updateField("fusionSolarStation", e.target.value)} />
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Subdomena</label>
            <input className={inputClasses} type="text" value={localConfig.fusionSolarSubdomain} onChange={(e) => updateField("fusionSolarSubdomain", e.target.value)} placeholder="uni004eu5" />
            <span className={unitClasses}>Prefiks iz FusionSolar URL-a</span>
          </div>
        </div>
        <details className="mt-3">
          <summary className={`${labelClasses} cursor-pointer hover:text-amber`}>Ručni cookie (alternativa)</summary>
          <div className="mt-2">
            <textarea className={inputClasses} rows={2} value={localConfig.fusionSolarCookie} onChange={(e) => updateField("fusionSolarCookie", e.target.value)} placeholder="JSESSIONID=...;HWWAFSESID=...;SSO_TGC_=..." />
            <span className={unitClasses}>Koristite ako auto-prijava ne radi</span>
          </div>
        </details>
      </div>

      <div className={sectionBox}>
        <h3 className={sectionHeading}>Solarni sustav</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div className={fieldGroup}>
            <label className={labelClasses}>Instalirana snaga</label>
            <input
              className={inputClasses}
              type="number"
              step="0.1"
              min="0"
              value={localConfig.installedKwp || ""}
              onChange={(e) => updateField("installedKwp", parseFloat(e.target.value) || 0)}
              placeholder="npr. 10.8"
            />
            <span className={unitClasses}>kWp — ukupna vršna snaga panela</span>
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Cijena sustava (s instalacijom)</label>
            <input
              className={inputClasses}
              type="number"
              step="100"
              min="0"
              value={localConfig.systemCostEur || ""}
              onChange={(e) => updateField("systemCostEur", parseFloat(e.target.value) || 0)}
              placeholder="npr. 7500"
            />
            <span className={unitClasses}>€ — ukupna investicija za ROI izračun</span>
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Datum instalacije</label>
            <input
              className={inputClasses}
              type="date"
              value={localConfig.installationDate}
              onChange={(e) => updateField("installationDate", e.target.value)}
            />
            <span className={unitClasses}>Za praćenje napretka otplate</span>
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Latitude</label>
            <input
              className={inputClasses}
              type="number"
              step="0.001"
              value={localConfig.latitude}
              onChange={(e) => updateField("latitude", parseFloat(e.target.value) || 0)}
            />
            <span className={unitClasses}>Za vremensku prognozu</span>
          </div>
          <div className={fieldGroup}>
            <label className={labelClasses}>Longitude</label>
            <input
              className={inputClasses}
              type="number"
              step="0.001"
              value={localConfig.longitude}
              onChange={(e) => updateField("longitude", parseFloat(e.target.value) || 0)}
            />
            <span className={unitClasses}>Za vremensku prognozu</span>
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

      <div className={sectionBox}>
        <h3 className={sectionHeading}>Povijest cijena</h3>
        <p className="font-mono text-[0.6rem] text-text-dim leading-normal mb-4">
          Dodajte periode s različitim cijenama. Zadnje cijene iznad se koriste za mjesece bez definiranog perioda.
        </p>

        {localConfig.tariffHistory.map((period, index) => (
          <details key={index} className="mb-3 border border-border rounded-sm">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-surface-2">
              <span className="font-mono text-xs text-text">
                {period.label || `Period ${index + 1}`} — od {period.validFrom}
              </span>
              <button
                className="font-mono text-xs text-red hover:text-red/70 px-2"
                onClick={(e) => {
                  e.preventDefault();
                  const updated = localConfig.tariffHistory.filter((_, i) => i !== index);
                  setLocalConfig((prev) => ({ ...prev, tariffHistory: updated }));
                }}
              >
                Obriši
              </button>
            </summary>
            <div className="p-3 border-t border-border">
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                <div className={fieldGroup}>
                  <label className={labelClasses}>Naziv</label>
                  <input className={inputClasses} type="text" value={period.label} onChange={(e) => updatePeriodField(index, "label", e.target.value)} placeholder="npr. HEPI 2024" />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Od datuma</label>
                  <input className={inputClasses} type="date" value={period.validFrom} onChange={(e) => updatePeriodField(index, "validFrom", e.target.value)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Model</label>
                  <select className={inputClasses} value={period.tariffModel} onChange={(e) => updatePeriodField(index, "tariffModel", e.target.value as "single" | "dual")}>
                    <option value="single">JT</option>
                    <option value="dual">VT/NT</option>
                  </select>
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>JT cijena</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.energyPriceSingleTariff} onChange={(e) => updatePeriodField(index, "energyPriceSingleTariff", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>VT cijena</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.energyPriceHighTariff} onChange={(e) => updatePeriodField(index, "energyPriceHighTariff", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>NT cijena</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.energyPriceLowTariff} onChange={(e) => updatePeriodField(index, "energyPriceLowTariff", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Opskrbna</label>
                  <input className={inputClasses} type="number" step="0.001" value={period.supplyFee} onChange={(e) => updatePeriodField(index, "supplyFee", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Dist JT</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.distributionSingleTariff} onChange={(e) => updatePeriodField(index, "distributionSingleTariff", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Dist VT</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.distributionHighTariff} onChange={(e) => updatePeriodField(index, "distributionHighTariff", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Dist NT</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.distributionLowTariff} onChange={(e) => updatePeriodField(index, "distributionLowTariff", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Prij JT</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.transmissionSingleTariff} onChange={(e) => updatePeriodField(index, "transmissionSingleTariff", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Prij VT</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.transmissionHighTariff} onChange={(e) => updatePeriodField(index, "transmissionHighTariff", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Prij NT</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.transmissionLowTariff} onChange={(e) => updatePeriodField(index, "transmissionLowTariff", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Mjerna</label>
                  <input className={inputClasses} type="number" step="0.001" value={period.meteringFee} onChange={(e) => updatePeriodField(index, "meteringFee", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>Solidarna</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.solidarityRate} onChange={(e) => updatePeriodField(index, "solidarityRate", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>OIE</label>
                  <input className={inputClasses} type="number" step="0.000001" value={period.renewableEnergyRate} onChange={(e) => updatePeriodField(index, "renewableEnergyRate", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={fieldGroup}>
                  <label className={labelClasses}>PDV</label>
                  <input className={inputClasses} type="number" step="0.01" value={period.vatRate} onChange={(e) => updatePeriodField(index, "vatRate", parseFloat(e.target.value) || 0)} />
                </div>
                <div className={`${fieldGroup} justify-end`}>
                  <label className={labelClasses}>
                    <input type="checkbox" className="mr-1.5" checked={period.solidarityDiscount} onChange={(e) => updatePeriodField(index, "solidarityDiscount", e.target.checked)} />
                    Popust sol.
                  </label>
                </div>
              </div>
            </div>
          </details>
        ))}

        <button
          className="font-mono text-xs text-amber border border-amber/30 rounded-sm px-4 py-2 hover:bg-amber/10 transition-colors cursor-pointer"
          onClick={handleAddPeriod}
        >
          + Dodaj period
        </button>
      </div>

      <div className="flex gap-3 flex-wrap mt-4 sm:mt-6">
        <button className="bg-amber text-background border-none rounded-sm px-6 py-2.5 font-body text-sm font-bold cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-[#f5b030] hover:-translate-y-px active:translate-y-0" onClick={handleSave}>{saveButtonLabel}</button>
        <button className="bg-transparent border border-border text-text rounded-sm px-6 py-2.5 font-body text-sm font-bold cursor-pointer transition-all duration-150 whitespace-nowrap hover:border-amber hover:text-amber hover:bg-transparent" onClick={handleReset}>Vrati zadano</button>
      </div>
    </>
  );
}
