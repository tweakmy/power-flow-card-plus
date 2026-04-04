import {
  mdiBattery,
  mdiBatteryHigh,
  mdiBatteryLow,
  mdiBatteryMedium,
  mdiBatteryOutline,
  mdiHome,
  mdiSolarPower,
  mdiTransmissionTower,
} from "@mdi/js";
import { html, svg } from "lit";

const resolveIconPath = (icon?: string) => {
  switch (icon) {
    case "mdi:solar-power":
    case "mdi:weather-sunny":
      return mdiSolarPower;
    case "mdi:transmission-tower":
      return mdiTransmissionTower;
    case "mdi:home":
      return mdiHome;
    case "mdi:battery":
      return mdiBattery;
    case "mdi:battery-medium":
      return mdiBatteryMedium;
    case "mdi:battery-low":
      return mdiBatteryLow;
    case "mdi:battery-outline":
      return mdiBatteryOutline;
    case "mdi:battery-high":
    default:
      return icon?.startsWith("mdi:battery") ? mdiBatteryHigh : null;
  }
};

export const renderEntitySvgIcon = (icon: string | undefined, id: string) => {
  if (!icon || icon === " ") return null;

  const iconPath = resolveIconPath(icon);
  if (!iconPath) {
    return html`<ha-icon id=${id} .icon=${icon}></ha-icon>`;
  }

  return svg`<svg id=${id} class="entity-svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d=${iconPath}></path>
  </svg>`;
};
