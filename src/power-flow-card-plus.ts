/* eslint-disable wc/guard-super-call */
import { ActionConfig, HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
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
import { UnsubscribeFunc } from "home-assistant-js-websocket";
import { html, LitElement, PropertyValues, svg, TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { batteryElement } from "./components/battery";
import { flowElement } from "./components/flows";
import { gridElement } from "./components/grid";
import { homeElement } from "./components/home";
import { individualLeftBottomElement } from "./components/individualLeftBottomElement";
import { individualLeftTopElement } from "./components/individualLeftTopElement";
import { individualRightBottomElement } from "./components/individualRightBottomElement";
import { individualRightTopElement } from "./components/individualRightTopElement";
import { dashboardLinkElement } from "./components/misc/dashboard_link";
import { nonFossilElement } from "./components/nonFossil";
import { solarElement } from "./components/solar";
import { handleAction } from "./ha/panels/lovelace/common/handle-action";
import { PowerFlowCardPlusConfig } from "./power-flow-card-plus-config";
import { getBatteryInState, getBatteryOutState, getBatteryStateOfCharge } from "./states/raw/battery";
import { getGridConsumptionState, getGridProductionState, getGridSecondaryState } from "./states/raw/grid";
import { getHomeSecondaryState } from "./states/raw/home";
import { getIndividualObject, IndividualObject } from "./states/raw/individual/getIndividualObject";
import { getNonFossilHas, getNonFossilHasPercentage, getNonFossilSecondaryState } from "./states/raw/nonFossil";
import { getSolarSecondaryState, getSolarState } from "./states/raw/solar";
import { adjustZeroTolerance } from "./states/tolerance/base";
import { doesEntityExist } from "./states/utils/existenceEntity";
import { getEntityState } from "./states/utils/getEntityState";
import { getEntityStateWatts } from "./states/utils/getEntityStateWatts";
import { styles } from "./style";
import { allDynamicStyles } from "./style/all";
import { RenderTemplateResult, subscribeRenderTemplate } from "./template/ha-websocket.js";
import { GridObject, HomeSources, NewDur, TemplatesObj } from "./type";
import { computeFieldIcon, computeFieldName } from "./utils/computeFieldAttributes";
import { computeFlowRate } from "./utils/computeFlowRate";
import {
  checkHasBottomIndividual,
  checkHasRightIndividual,
  getBottomLeftIndividual,
  getBottomRightIndividual,
  getTopLeftIndividual,
  getTopRightIndividual,
} from "./utils/computeIndividualPosition";
import { checkShouldShowDots } from "./utils/checkShouldShowDots";
import { displayValue } from "./utils/displayValue";
import { defaultValues, getDefaultConfig } from "./utils/get-default-config";
import { showLine } from "./utils/showLine";
import { registerCustomCard } from "./utils/register-custom-card";
import { coerceNumber } from "./utils/utils";

const circleCircumference = 238.76104;

registerCustomCard({
  type: "power-flow-card-plus",
  name: "Power Flow Card Plus",
  description:
    "An extended version of the power flow card with richer options, advanced features and a few small UI enhancements. Inspired by the Energy Dashboard.",
});

@customElement("power-flow-card-plus")
export class PowerFlowCardPlus extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config = {} as PowerFlowCardPlusConfig;

  @state() private _templateResults: Partial<Record<string, RenderTemplateResult>> = {};
  @state() private _unsubRenderTemplates?: Map<string, Promise<UnsubscribeFunc>> = new Map();
  @state() private _width = 0;

  @query("#battery-grid-flow") batteryGridFlow?: SVGSVGElement;
  @query("#battery-home-flow") batteryToHomeFlow?: SVGSVGElement | HTMLCanvasElement;
  @query("#grid-home-flow") gridToHomeFlow?: SVGSVGElement;
  @query("#solar-battery-flow") solarToBatteryFlow?: SVGSVGElement;
  @query("#solar-grid-flow") solarToGridFlow?: SVGSVGElement;
  @query("#solar-home-flow") solarToHomeFlow?: SVGSVGElement;

  setConfig(config: PowerFlowCardPlusConfig): void {
    if ((config.entities as any).individual1 || (config.entities as any).individual2) {
      throw new Error("You are using an outdated configuration. Please update your configuration to the latest version.");
    }
    if (!config.entities || (!config.entities?.battery?.entity && !config.entities?.grid?.entity && !config.entities?.solar?.entity)) {
      throw new Error("At least one entity for battery, grid or solar must be defined");
    }
    this._config = {
      ...config,
      kw_decimals: coerceNumber(config.kw_decimals, defaultValues.kilowattDecimals),
      min_flow_rate: coerceNumber(config.min_flow_rate, defaultValues.minFlowRate),
      max_flow_rate: coerceNumber(config.max_flow_rate, defaultValues.maxFlowRate),
      w_decimals: coerceNumber(config.w_decimals, defaultValues.wattDecimals),
      watt_threshold: coerceNumber(config.watt_threshold, defaultValues.wattThreshold),
      max_expected_power: coerceNumber(config.max_expected_power, defaultValues.maxExpectedPower),
      min_expected_power: coerceNumber(config.min_expected_power, defaultValues.minExpectedPower),
      display_zero_lines: {
        mode: config.display_zero_lines?.mode ?? defaultValues.displayZeroLines.mode,
        transparency: coerceNumber(config.display_zero_lines?.transparency, defaultValues.displayZeroLines.transparency),
        grey_color: config.display_zero_lines?.grey_color ?? defaultValues.displayZeroLines.grey_color,
      },
    };
  }

  public connectedCallback() {
    super.connectedCallback();
    this.setAttribute("smiley", "build-ok-temp");
    this._tryConnectAll();
  }

  public disconnectedCallback() {
    this._tryDisconnectAll();
  }

  // do not use ui editor for now, as it is not working
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ui-editor/ui-editor");
    return document.createElement("power-flow-card-plus-editor");
  }

  public static getStubConfig(hass: HomeAssistant): object {
    // get available power entities
    return getDefaultConfig(hass);
  }

  public getCardSize(): Promise<number> | number {
    return 3;
  }

  private previousDur: { [name: string]: number } = {};

  public openDetails(
    event: { stopPropagation: () => void; key?: string; target: HTMLElement },
    config?: ActionConfig,
    entityId?: string | undefined
  ): void {
    event.stopPropagation();

    if (!config) {
      if (!entityId || !this._config.clickable_entities) return;
      /* also needs to open details if entity is unavailable, but not if entity doesn't exist is hass states */
      if (!doesEntityExist(this.hass, entityId)) return;
      const e = new CustomEvent("hass-more-info", {
        composed: true,
        detail: { entityId },
      });
      this.dispatchEvent(e);
      return;
    }

    handleAction(
      event.target,
      this.hass!,
      {
        entity: entityId,
        tap_action: config,
      },
      "tap"
    );
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    const { entities } = this._config;

    this.style.setProperty("--clickable-cursor", this._config.clickable_entities ? "pointer" : "default");

    const initialNumericState = null as null | number;

    const grid: GridObject = {
      entity: entities.grid?.entity,
      has: entities?.grid?.entity !== undefined,
      hasReturnToGrid: typeof entities.grid?.entity === "string" || !!entities.grid?.entity?.production,
      state: {
        fromGrid: getGridConsumptionState(this.hass, this._config),
        toGrid: getGridProductionState(this.hass, this._config),
        toBattery: initialNumericState,
        toHome: initialNumericState,
      },
      powerOutage: {
        has: entities.grid?.power_outage?.entity !== undefined,
        isOutage:
          (entities.grid && this.hass.states[entities.grid.power_outage?.entity]?.state) === (entities.grid?.power_outage?.state_alert ?? "on"),
        icon: entities.grid?.power_outage?.icon_alert || "mdi:transmission-tower-off",
        name: entities.grid?.power_outage?.label_alert ?? html`Power<br />Outage`,
        entityGenerator: entities.grid?.power_outage?.entity_generator,
      },
      icon: computeFieldIcon(this.hass, entities.grid, "mdi:transmission-tower"),
      name: computeFieldName(this.hass, entities.grid, this.hass.localize("ui.panel.lovelace.cards.energy.energy_distribution.grid")),
      mainEntity:
        typeof entities.grid?.entity === "object" ? entities.grid.entity.consumption || entities.grid.entity.production : entities.grid?.entity,
      color: {
        fromGrid: entities.grid?.color?.consumption,
        toGrid: entities.grid?.color?.production,
        icon_type: entities.grid?.color_icon as boolean | "consumption" | "production" | undefined,
        circle_type: entities.grid?.color_circle,
      },
      tap_action: entities.grid?.tap_action,
      secondary: {
        entity: entities.grid?.secondary_info?.entity,
        decimals: entities.grid?.secondary_info?.decimals,
        template: entities.grid?.secondary_info?.template,
        has: entities.grid?.secondary_info?.entity !== undefined,
        state: getGridSecondaryState(this.hass, this._config),
        icon: entities.grid?.secondary_info?.icon,
        unit: entities.grid?.secondary_info?.unit_of_measurement,
        unit_white_space: entities.grid?.secondary_info?.unit_white_space,
        accept_negative: entities.grid?.secondary_info?.accept_negative || false,
        color: {
          type: entities.grid?.secondary_info?.color_value,
        },
        tap_action: entities.grid?.secondary_info?.tap_action,
      },
    };

    const hasSolarEntity = entities.solar?.entity !== undefined;
    const isProducingSolar = getSolarState(this.hass, this._config) ?? 0 > 0;
    const displayZero = entities.solar?.display_zero !== false || isProducingSolar;

    const solar = {
      entity: entities.solar?.entity as string | undefined,
      has: hasSolarEntity && displayZero,
      state: {
        total: getSolarState(this.hass, this._config),
        toHome: initialNumericState,
        toGrid: initialNumericState,
        toBattery: initialNumericState,
      },
      icon: computeFieldIcon(this.hass, entities.solar, "mdi:solar-power"),
      name: computeFieldName(this.hass, entities.solar, this.hass.localize("ui.panel.lovelace.cards.energy.energy_distribution.solar")),
      tap_action: entities.solar?.tap_action,
      secondary: {
        entity: entities.solar?.secondary_info?.entity,
        decimals: entities.solar?.secondary_info?.decimals,
        template: entities.solar?.secondary_info?.template,
        has: entities.solar?.secondary_info?.entity !== undefined,
        accept_negative: entities.solar?.secondary_info?.accept_negative || false,
        state: getSolarSecondaryState(this.hass, this._config),
        icon: entities.solar?.secondary_info?.icon,
        unit: entities.solar?.secondary_info?.unit_of_measurement,
        unit_white_space: entities.solar?.secondary_info?.unit_white_space,
        tap_action: entities.solar?.secondary_info?.tap_action,
      },
    };

    const checkIfHasBattery = () => {
      if (!entities.battery?.entity) return false;
      if (typeof entities.battery?.entity === "object") return entities.battery?.entity.consumption || entities.battery?.entity.production;
      return entities.battery?.entity !== undefined;
    };

    const battery = {
      entity: entities.battery?.entity,
      has: checkIfHasBattery(),
      mainEntity: typeof entities.battery?.entity === "object" ? entities.battery.entity.consumption : entities.battery?.entity,
      name: computeFieldName(this.hass, entities.battery, this.hass.localize("ui.panel.lovelace.cards.energy.energy_distribution.battery")),
      icon: computeFieldIcon(this.hass, entities.battery, "mdi:battery-high"),
      op_info: {
        entity: entities.battery?.op_info?.entity,
        state: entities.battery?.op_info?.entity ? this.hass.states[entities.battery.op_info.entity]?.state : undefined,
      },
      battery_temp: {
        entity: entities.battery?.battery_temp?.entity,
        state: entities.battery?.battery_temp?.entity
          ? this.hass.states[entities.battery.battery_temp.entity]?.state
          : undefined,
      },
      inverter_temp: {
        entity: entities.battery?.inverter_temp?.entity,
        state: entities.battery?.inverter_temp?.entity
          ? this.hass.states[entities.battery.inverter_temp.entity]?.state
          : undefined,
      },
      state_of_charge: {
        state: getBatteryStateOfCharge(this.hass, this._config),
        unit: entities?.battery?.state_of_charge_unit ?? "%",
        unit_white_space: entities?.battery?.state_of_charge_unit_white_space ?? true,
        decimals: entities?.battery?.state_of_charge_decimals || 0,
      },
      state: {
        toBattery: getBatteryInState(this.hass, this._config),
        fromBattery: getBatteryOutState(this.hass, this._config),
        toGrid: 0,
        toHome: 0,
      },
      tap_action: entities.battery?.tap_action,
      color: {
        fromBattery: entities.battery?.color?.consumption,
        toBattery: entities.battery?.color?.production,
        icon_type: undefined as string | boolean | undefined,
        circle_type: entities.battery?.color_circle,
      },
    };

    const home = {
      entity: entities.home?.entity,
      has: entities?.home?.entity !== undefined,
      state: initialNumericState,
      icon: computeFieldIcon(this.hass, entities?.home, "mdi:home"),
      name: computeFieldName(this.hass, entities?.home, this.hass.localize("ui.panel.lovelace.cards.energy.energy_distribution.home")),
      tap_action: entities.home?.tap_action,
      secondary: {
        entity: entities.home?.secondary_info?.entity,
        template: entities.home?.secondary_info?.template,
        has: entities.home?.secondary_info?.entity !== undefined,
        state: getHomeSecondaryState(this.hass, this._config),
        accept_negative: entities.home?.secondary_info?.accept_negative || false,
        unit: entities.home?.secondary_info?.unit_of_measurement,
        unit_white_space: entities.home?.secondary_info?.unit_white_space,
        icon: entities.home?.secondary_info?.icon,
        decimals: entities.home?.secondary_info?.decimals,
        tap_action: entities.home?.secondary_info?.tap_action,
      },
    };

    type IndividualObjects = IndividualObject[] | [];
    const individualObjs: IndividualObjects = entities.individual?.map((individual) => getIndividualObject(this.hass, individual)) || [];

    const nonFossil = {
      entity: entities.fossil_fuel_percentage?.entity,
      name: computeFieldName(this.hass, entities.fossil_fuel_percentage, this.hass.localize("card.label.non_fossil_fuel_percentage")),
      icon: computeFieldIcon(this.hass, entities.fossil_fuel_percentage, "mdi:leaf"),
      has: getNonFossilHas(this.hass, this._config),
      hasPercentage: getNonFossilHasPercentage(this.hass, this._config),
      state: {
        power: initialNumericState,
      },
      color: entities.fossil_fuel_percentage?.color,
      color_value: entities.fossil_fuel_percentage?.color_value,
      tap_action: entities.fossil_fuel_percentage?.tap_action,
      secondary: {
        entity: entities.fossil_fuel_percentage?.secondary_info?.entity,
        decimals: entities.fossil_fuel_percentage?.secondary_info?.decimals,
        template: entities.fossil_fuel_percentage?.secondary_info?.template,
        has: entities.fossil_fuel_percentage?.secondary_info?.entity !== undefined,
        state: getNonFossilSecondaryState(this.hass, this._config),
        accept_negative: entities.fossil_fuel_percentage?.secondary_info?.accept_negative || false,
        icon: entities.fossil_fuel_percentage?.secondary_info?.icon,
        unit: entities.fossil_fuel_percentage?.secondary_info?.unit_of_measurement,
        unit_white_space: entities.fossil_fuel_percentage?.secondary_info?.unit_white_space,
        color_value: entities.fossil_fuel_percentage?.secondary_info?.color_value,
        tap_action: entities.fossil_fuel_percentage?.secondary_info?.tap_action,
      },
    };

    // Reset Values below Display Zero Tolerance
    grid.state.fromGrid = adjustZeroTolerance(grid.state.fromGrid, entities.grid?.display_zero_tolerance);
    grid.state.toGrid = adjustZeroTolerance(grid.state.toGrid, entities.grid?.display_zero_tolerance);
    solar.state.total = adjustZeroTolerance(solar.state.total, entities.solar?.display_zero_tolerance);
    battery.state.fromBattery = adjustZeroTolerance(battery.state.fromBattery, entities.battery?.display_zero_tolerance);
    battery.state.toBattery = adjustZeroTolerance(battery.state.toBattery, entities.battery?.display_zero_tolerance);
    if (grid.state.fromGrid === 0) {
      grid.state.toHome = 0;
      grid.state.toBattery = 0;
    }
    if (solar.state.total === 0) {
      solar.state.toGrid = 0;
      solar.state.toBattery = 0;
      solar.state.toHome = 0;
    }
    if (battery.state.fromBattery === 0) {
      battery.state.toGrid = 0;
      battery.state.toHome = 0;
    }

    if (solar.has) {
      solar.state.toHome = (solar.state.total ?? 0) - (grid.state.toGrid ?? 0) - (battery.state.toBattery ?? 0);
    }
    const largestGridBatteryTolerance = Math.max(entities.grid?.display_zero_tolerance ?? 0, entities.battery?.display_zero_tolerance ?? 0);

    if (solar.state.toHome !== null && solar.state.toHome < 0) {
      // What we returned to the grid and what went in to the battery is more
      // than produced, so we have used grid energy to fill the battery or
      // returned battery energy to the grid
      if (battery.has) {
        grid.state.toBattery = Math.abs(solar.state.toHome);
        if (grid.state.toBattery > (grid.state.fromGrid ?? 0)) {
          battery.state.toGrid = Math.min(grid.state.toBattery - (grid.state.fromGrid ?? 0), 0);
          grid.state.toBattery = grid.state.fromGrid;
        }
      }
      solar.state.toHome = 0;
    } else if (battery.state.toBattery !== null && battery.state.toBattery > 0) {
      // Battery is being charged, but by what (grid or solar) and by how much?
      // Solar is charging battery with any power left over after powering the
      // home and sending to grid
      solar.state.toBattery = solar.state.total - (solar.state.toHome || 0) - (grid.state.toGrid || 0);

      // Grid is providing any left over battery charging power after
      // compensating for the solar charging
      grid.state.toBattery = battery.state.toBattery - solar.state.toBattery;
    } else {
      grid.state.toBattery = 0;
    }
    grid.state.toBattery = (grid.state.toBattery ?? 0) > largestGridBatteryTolerance ? grid.state.toBattery : 0;

    if (battery.has) {
      if (solar.has) {
        if (!battery.state.toGrid) {
          battery.state.toGrid = Math.max(
            0,
            (grid.state.toGrid || 0) - (solar.state.total || 0) - (battery.state.toBattery || 0) - (grid.state.toBattery || 0)
          );
        }
        solar.state.toBattery = battery.state.toBattery - (grid.state.toBattery || 0);
        if (entities.solar?.display_zero_tolerance) {
          if (entities.solar.display_zero_tolerance >= (solar.state.total || 0)) solar.state.toBattery = 0;
        }
      } else {
        battery.state.toGrid = grid.state.toGrid || 0;
      }
      battery.state.toGrid = (battery.state.toGrid || 0) > largestGridBatteryTolerance ? battery.state.toGrid || 0 : 0;
      battery.state.toHome = (battery.state.fromBattery ?? 0) - (battery.state.toGrid ?? 0);
    }

    grid.state.toHome = Math.max(grid.state.fromGrid - (grid.state.toBattery ?? 0), 0);

    if (solar.has && grid.state.toGrid) solar.state.toGrid = grid.state.toGrid - (battery.state.toGrid ?? 0);

    // Handle Power Outage
    if (grid.powerOutage.isOutage) {
      grid.state.fromGrid = grid.powerOutage.entityGenerator ? Math.max(getEntityStateWatts(this.hass, grid.powerOutage.entityGenerator), 0) : 0;
      grid.state.toHome = Math.max(grid.state.fromGrid - (grid.state.toBattery ?? 0), 0);
      grid.state.toGrid = 0;
      battery.state.toGrid = 0;
      solar.state.toGrid = 0;
      grid.icon = grid.powerOutage.icon;
      nonFossil.has = false;
      nonFossil.hasPercentage = false;
    }

    // Set Initial State for Non Fossil Fuel Percentage
    if (nonFossil.has) {
      const nonFossilFuelDecimal = 1 - (getEntityState(this.hass, entities.fossil_fuel_percentage?.entity) ?? 0) / 100;
      nonFossil.state.power = grid.state.toHome * nonFossilFuelDecimal;
    }

    // Calculate Individual Consumption, ignore not shown objects
    const totalIndividualConsumption = individualObjs?.reduce((a, b) => a + (b.has ? b.state || 0 : 0), 0) || 0;

    // Calculate Total Consumptions
    const totalHomeConsumption = Math.max(grid.state.toHome + (solar.state.toHome ?? 0) + (battery.state.toHome ?? 0), 0);

    // Calculate Circumferences
    const homeBatteryCircumference = battery.state.toHome ? circleCircumference * (battery.state.toHome / totalHomeConsumption) : 0;
    const homeSolarCircumference = solar.state.toHome ? circleCircumference * (solar.state.toHome / totalHomeConsumption) : 0;
    const homeNonFossilCircumference = nonFossil.state.power ? circleCircumference * (nonFossil.state.power / totalHomeConsumption) : 0;
    const homeGridCircumference =
      circleCircumference *
      ((totalHomeConsumption - (nonFossil.state.power ?? 0) - (battery.state.toHome ?? 0) - (solar.state.toHome ?? 0)) / totalHomeConsumption);

    const homeUsageToDisplay =
      entities.home?.override_state && entities.home.entity
        ? entities.home?.subtract_individual
          ? displayValue(this.hass, this._config, getEntityStateWatts(this.hass, entities.home.entity) - totalIndividualConsumption, {
              unit: entities.home?.unit_of_measurement,
              unitWhiteSpace: entities.home?.unit_white_space,
              watt_threshold: this._config.watt_threshold,
            })
          : displayValue(this.hass, this._config, getEntityStateWatts(this.hass, entities.home.entity), {
              unit: entities.home?.unit_of_measurement,
              unitWhiteSpace: entities.home?.unit_white_space,
              watt_threshold: this._config.watt_threshold,
            })
        : entities.home?.subtract_individual
        ? displayValue(this.hass, this._config, totalHomeConsumption - totalIndividualConsumption || 0, {
            unit: entities.home?.unit_of_measurement,
            unitWhiteSpace: entities.home?.unit_white_space,
            watt_threshold: this._config.watt_threshold,
          })
        : displayValue(this.hass, this._config, totalHomeConsumption, {
            unit: entities.home?.unit_of_measurement,
            unitWhiteSpace: entities.home?.unit_white_space,
            watt_threshold: this._config.watt_threshold,
          });

    const totalLines =
      grid.state.toHome +
      (solar.state.toHome ?? 0) +
      (solar.state.toGrid ?? 0) +
      (solar.state.toBattery ?? 0) +
      (battery.state.toHome ?? 0) +
      (grid.state.toBattery ?? 0) +
      (battery.state.toGrid ?? 0);

    // Battery SoC
    if (battery.state_of_charge.state === null) {
      battery.icon = "mdi:battery";
    } else if (battery.state_of_charge.state <= 72 && battery.state_of_charge.state > 44) {
      battery.icon = "mdi:battery-medium";
    } else if (battery.state_of_charge.state <= 44 && battery.state_of_charge.state > 16) {
      battery.icon = "mdi:battery-low";
    } else if (battery.state_of_charge.state <= 16) {
      battery.icon = "mdi:battery-outline";
    }
    if (entities.battery?.icon !== undefined) battery.icon = entities.battery?.icon;

    // override icon of battery entity if use_metadata is true
    const batteryUseMetadataIcon = entities.battery?.use_metadata;
    if (batteryUseMetadataIcon) {
      const metadataIcon = computeFieldIcon(this.hass, entities.battery, "NO_ICON_METADATA");
      if (metadataIcon !== "NO_ICON_METADATA") {
        battery.icon = metadataIcon;
      }
    }

    // Compute durations
    const newDur: NewDur = {
      batteryGrid: computeFlowRate(this._config, grid.state.toBattery ?? battery.state.toGrid ?? 0, totalLines),
      batteryToHome: computeFlowRate(this._config, battery.state.toHome ?? 0, totalLines),
      gridToHome: computeFlowRate(this._config, grid.state.toHome, totalLines),
      solarToBattery: computeFlowRate(this._config, solar.state.toBattery ?? 0, totalLines),
      solarToGrid: computeFlowRate(this._config, solar.state.toGrid ?? 0, totalLines),
      solarToHome: computeFlowRate(this._config, solar.state.toHome ?? 0, totalLines),
      individual: individualObjs?.map((individual) => computeFlowRate(this._config, individual.state ?? 0, totalIndividualConsumption)) || [],
      nonFossil: computeFlowRate(this._config, nonFossil.state.power ?? 0, totalLines),
    };

    // Smooth duration changes
    ["batteryGrid", "batteryToHome", "gridToHome", "solarToBattery", "solarToGrid", "solarToHome"].forEach((flowName) => {
      const flowSVGElement = this[`${flowName}Flow`] as SVGSVGElement;
      if (flowSVGElement && this.previousDur[flowName] && this.previousDur[flowName] !== newDur[flowName]) {
        flowSVGElement.pauseAnimations();
        flowSVGElement.setCurrentTime(flowSVGElement.getCurrentTime() * (newDur[flowName] / this.previousDur[flowName]));
        flowSVGElement.unpauseAnimations();
      }
      this.previousDur[flowName] = newDur[flowName];
    });

    const homeSources: HomeSources = {
      battery: {
        value: homeBatteryCircumference,
        color: "var(--energy-battery-out-color)",
      },
      solar: {
        value: homeSolarCircumference,
        color: "var(--energy-solar-color)",
      },
      grid: {
        value: homeGridCircumference,
        color: "var(--energy-grid-consumption-color)",
      },
      gridNonFossil: {
        value: homeNonFossilCircumference,
        color: "var(--energy-non-fossil-color)",
      },
    };

    const homeLargestSource = Object.keys(homeSources).reduce((a, b) => (homeSources[a].value > homeSources[b].value ? a : b));

    const getIndividualDisplayState = (field?: IndividualObject) => {
      if (!field) return "";
      if (field?.state === undefined) return "";
      return displayValue(this.hass, this._config, field?.state, {
        decimals: field?.decimals,
        unit: field?.unit,
        unitWhiteSpace: field?.unit_white_space,
        watt_threshold: this._config.watt_threshold,
      });
    };

    const individualKeys = ["left-top", "left-bottom", "right-top", "right-bottom"];
    // Templates
    const templatesObj: TemplatesObj = {
      gridSecondary: this._templateResults.gridSecondary?.result,
      solarSecondary: this._templateResults.solarSecondary?.result,
      homeSecondary: this._templateResults.homeSecondary?.result,

      nonFossilFuelSecondary: this._templateResults.nonFossilFuelSecondary?.result,
      individual: individualObjs?.map((_, index) => this._templateResults[`${individualKeys[index]}Secondary`]?.result) || [],
    };

    // Styles
    const isCardWideEnough = this._width > 420;
    allDynamicStyles(this, {
      grid,
      solar,
      battery,
      display_zero_lines_grey_color: this._config.display_zero_lines?.mode === "grey_out" ? this._config.display_zero_lines?.grey_color : "",
      display_zero_lines_transparency: this._config.display_zero_lines?.mode === "transparency" ? this._config.display_zero_lines?.transparency : "",
      entities,
      homeLargestSource,
      homeSources,
      individual: individualObjs,
      nonFossil,
      isCardWideEnough,
    });

    const sortedIndividualObjects = this._config.sort_individual_devices ? sortIndividualObjects(individualObjs) : individualObjs;

    const individualFieldLeftTop = getTopLeftIndividual(sortedIndividualObjects);
    const individualFieldLeftBottom = getBottomLeftIndividual(sortedIndividualObjects);
    const individualFieldRightTop = getTopRightIndividual(sortedIndividualObjects);
    const individualFieldRightBottom = getBottomRightIndividual(sortedIndividualObjects);

    const mobileViewportWidth = this._width || 414;
    const mobileViewportHeight = typeof window !== "undefined" ? window.innerHeight : Math.round(mobileViewportWidth * 1.78);
    const mobileViewBoxWidth = Math.max(400, mobileViewportWidth);
    const mobileViewBoxHeight = Math.max(900, mobileViewportHeight);
    // mobileScale: 1 SVG unit ≈ 1 CSS px — all sizes multiply by this so visuals stay constant
    const mobileScale = mobileViewBoxWidth / 200;
    const mobileCenterX = mobileViewBoxWidth / 2;

    // Shared mobile SVG geometry (all relative to group center = 0,0)
    const mobileR = Math.round(30 * mobileScale);
    const mobileIconSize = Math.round(20 * mobileScale);
    const mobileIconX = -(mobileIconSize / 2);
    const mobileIconY = -Math.round(18 * mobileScale);
    const mobileValueY = Math.round(7 * mobileScale);
    const mobileLabelY = mobileR + Math.round(6 * mobileScale);
    const mobileStrokeWidth = Math.round(2 * mobileScale);
    const mobileDotRadius = Math.round(2.4 * mobileScale * 10) / 10;
    const mobileFontSizeLg = Math.round(12 * mobileScale);
    const mobileFontSizeSm = Math.round(10 * mobileScale);
    const mobileSidePadding = 10;

    const mobileVerticalTopPadding = Math.round(24 * mobileScale);
    const mobileVerticalBottomPadding = Math.round(24 * mobileScale);
    const mobileVerticalLayoutHeight = Math.max(
      380,
      Math.min(620, mobileViewportHeight - mobileVerticalTopPadding - mobileVerticalBottomPadding)
    );
    const mobileSolarCy = Math.max(70, mobileVerticalTopPadding);
    const mobileVerticalStep = Math.round((mobileVerticalLayoutHeight - mobileSolarCy - mobileLabelY) / 3);
    const mobileGridCx = mobileViewBoxWidth - mobileSidePadding - mobileR - 27;
    const mobileGridCy = mobileSolarCy + mobileVerticalStep;
    const mobileHomeCx = mobileSidePadding + mobileR;
    const mobileHomeCy = mobileSolarCy + mobileVerticalStep * 2;
    const mobileSolarCx = (mobileHomeCx + mobileGridCx) / 2;
    const mobileBatteryCx = mobileSolarCx;
    const mobileBatteryCy = mobileSolarCy + mobileVerticalStep * 3;
    const mobileSolarValue = displayValue(this.hass, this._config, solar.state.total || 0, {
      decimals: 1,
      watt_threshold: this._config.watt_threshold,
    });
    const mobileSecondaryTextColor = "#9ca3af";
    const mobileLineOpacity = (power: number): number => {
      if (power > 0) return 1;
      const mode = this._config?.display_zero_lines?.mode;
      if (mode === "transparency" || mode === "custom") {
        const t = this._config?.display_zero_lines?.transparency ?? 50;
        return 1 - t / 100;
      }
      return 1;
    };
    const mobileSolarColor = "#ff9800";
    const toHexFromRgbArray = (arr: number[]) =>
      `#${arr
        .slice(0, 3)
        .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
        .join("")}`;
    const normalizeMobileColor = (input: unknown, fallback: string) => {
      if (Array.isArray(input) && input.length >= 3) return toHexFromRgbArray(input as number[]);
      if (typeof input === "string" && input.trim() !== "") return input;
      return fallback;
    };
    const mobileGridConsumptionColor = normalizeMobileColor(grid.color.fromGrid, "#488fc2");
    const mobileGridReturnColor = normalizeMobileColor(grid.color.toGrid, "#8353d1");
    const mobileBatteryInColor = normalizeMobileColor(battery.color.toBattery, "#a280db");
    const mobileBatteryOutColor = normalizeMobileColor(battery.color.fromBattery, "#4db6ac");
    const mobileNonFossilColor = "#0f9d58";

    const mobileBatteryIsCharging = (battery.state.toBattery || 0) > (battery.state.fromBattery || 0);
    const mobileBatteryColor = mobileBatteryIsCharging ? mobileBatteryInColor : mobileBatteryOutColor;
    const mobileBatteryInTextColor = "#F06292";
    const mobileBatteryOutTextColor = entities.battery?.color_value === false ? "#000" : mobileBatteryOutColor;
    const mobileBatteryCircleColor = mobileBatteryIsCharging ? "#F06292" : mobileBatteryOutTextColor;
    const mobileBatteryValueFontSize = Math.round(9 * mobileScale);
    const mobileBatteryValueLineGap = Math.round(11 * mobileScale);
    const mobileShowBatteryIn =
      entities.battery?.display_state === "two_way" ||
      entities.battery?.display_state === undefined ||
      (entities.battery?.display_state === "one_way_no_zero" && (battery.state.toBattery || 0) > 0) ||
      (entities.battery?.display_state === "one_way" && (battery.state.toBattery || 0) !== 0);
    const mobileShowBatteryOut =
      entities.battery?.display_state === "two_way" ||
      entities.battery?.display_state === undefined ||
      (entities.battery?.display_state === "one_way_no_zero" && (battery.state.fromBattery || 0) > 0) ||
      (entities.battery?.display_state === "one_way" && ((battery.state.toBattery || 0) === 0 || (battery.state.fromBattery || 0) !== 0));
    const getMobileBatteryDecimals = (value: number) => {
      const configuredUnit = entities.battery?.unit_of_measurement;
      const usesAutoKw = configuredUnit === undefined && value >= this._config.watt_threshold;
      const usesExplicitKw = configuredUnit?.toLowerCase() === "kw";

      return usesAutoKw || usesExplicitKw ? 1 : this._config.w_decimals;
    };
    const mobileBatteryInValue = displayValue(this.hass, this._config, battery.state.toBattery || 0, {
      unit: entities.battery?.unit_of_measurement,
      unitWhiteSpace: entities.battery?.unit_white_space,
      decimals: getMobileBatteryDecimals(battery.state.toBattery || 0),
      watt_threshold: this._config.watt_threshold,
    });
    const mobileBatteryOutValue = displayValue(this.hass, this._config, battery.state.fromBattery || 0, {
      unit: entities.battery?.unit_of_measurement,
      unitWhiteSpace: entities.battery?.unit_white_space,
      decimals: getMobileBatteryDecimals(battery.state.fromBattery || 0),
      watt_threshold: this._config.watt_threshold,
    });
    const mobileBatteryIconPath =
      battery.icon === "mdi:battery"
        ? mdiBattery
        : battery.icon === "mdi:battery-medium"
        ? mdiBatteryMedium
        : battery.icon === "mdi:battery-low"
        ? mdiBatteryLow
        : battery.icon === "mdi:battery-outline"
        ? mdiBatteryOutline
        : mdiBatteryHigh;

    const mobileGridIsExporting = (grid.state.toGrid ?? 0) > 0;
    const mobileGridEnergyColor = mobileGridIsExporting ? mobileGridReturnColor : mobileGridConsumptionColor;
    const mobileGridIconColor =
      entities.grid?.color_icon === "consumption"
        ? mobileGridConsumptionColor
        : entities.grid?.color_icon === "production"
        ? mobileGridReturnColor
        : entities.grid?.color_icon === true
        ? (grid.state.fromGrid ?? 0) >= (grid.state.toGrid ?? 0)
          ? mobileGridConsumptionColor
          : mobileGridReturnColor
        : "#000";
    const mobileGridCircleColor =
      entities.grid?.color_circle === "consumption"
        ? mobileGridConsumptionColor
        : entities.grid?.color_circle === "production"
        ? mobileGridReturnColor
        : entities.grid?.color_circle === true
        ? (grid.state.fromGrid ?? 0) >= (grid.state.toGrid ?? 0)
          ? mobileGridConsumptionColor
          : mobileGridReturnColor
        : mobileGridConsumptionColor;
    const mobileGridReturnTextColor = entities.grid?.color_value === false ? "#000" : mobileGridReturnColor;
    const mobileGridConsumptionTextColor = entities.grid?.color_value === false ? "#000" : mobileGridConsumptionColor;
    const mobileGridValueFontSize = Math.round(9 * mobileScale);
    const mobileGridValueLineGap = Math.round(11 * mobileScale);
    const mobileShowGridReturn =
      (entities.grid?.display_state === "two_way" ||
        entities.grid?.display_state === undefined ||
        (entities.grid?.display_state === "one_way_no_zero" && (grid.state.toGrid ?? 0) > 0) ||
        (entities.grid?.display_state === "one_way" && ((grid.state.fromGrid ?? 0) === 0) && (grid.state.toGrid ?? 0) !== 0)) &&
      grid.state.toGrid !== null &&
      !grid.powerOutage.isOutage;
    const mobileShowGridConsumption =
      ((entities.grid?.display_state === "two_way" ||
        entities.grid?.display_state === undefined ||
        (entities.grid?.display_state === "one_way_no_zero" && (grid.state.fromGrid ?? 0) > 0) ||
        (entities.grid?.display_state === "one_way" && (grid.state.toGrid === null || grid.state.toGrid === 0))) &&
        grid.state.fromGrid !== null &&
        !grid.powerOutage.isOutage) ||
      (grid.powerOutage.isOutage && !!grid.powerOutage.entityGenerator);
    const getMobileGridDecimals = (value: number) => {
      const configuredUnit = entities.grid?.unit_of_measurement;
      const usesAutoKw = configuredUnit === undefined && value >= this._config.watt_threshold;
      const usesExplicitKw = configuredUnit?.toLowerCase() === "kw";

      return usesAutoKw || usesExplicitKw ? 1 : this._config.w_decimals;
    };
    const mobileGridReturnValue = displayValue(this.hass, this._config, grid.state.toGrid || 0, {
      unit: entities.grid?.unit_of_measurement,
      unitWhiteSpace: entities.grid?.unit_white_space,
      decimals: getMobileGridDecimals(grid.state.toGrid || 0),
      watt_threshold: this._config.watt_threshold,
    });
    const mobileGridConsumptionValue = displayValue(this.hass, this._config, grid.state.fromGrid || 0, {
      unit: entities.grid?.unit_of_measurement,
      unitWhiteSpace: entities.grid?.unit_white_space,
      decimals: getMobileGridDecimals(grid.state.fromGrid || 0),
      watt_threshold: this._config.watt_threshold,
    });

    const mobileHomeSourceColors: HomeSources = {
      battery: {
        value: homeBatteryCircumference,
        color: mobileBatteryOutColor,
      },
      solar: {
        value: homeSolarCircumference,
        color: mobileSolarColor,
      },
      grid: {
        value: homeGridCircumference,
        color: mobileGridConsumptionColor,
      },
      gridNonFossil: {
        value: homeNonFossilCircumference,
        color: mobileNonFossilColor,
      },
    };

    const mobileHomeLargestSource = Object.keys(mobileHomeSourceColors).reduce((a, b) =>
      mobileHomeSourceColors[a].value > mobileHomeSourceColors[b].value ? a : b
    ) as keyof HomeSources;

    const mobileHomeColor = mobileHomeSourceColors[mobileHomeLargestSource].color;
    const parseHexColor = (hexColor: string) => {
      const normalizedHex = hexColor.replace("#", "");
      const expandedHex =
        normalizedHex.length === 3
          ? normalizedHex
              .split("")
              .map((char) => `${char}${char}`)
              .join("")
          : normalizedHex;

      return {
        r: parseInt(expandedHex.slice(0, 2), 16),
        g: parseInt(expandedHex.slice(2, 4), 16),
        b: parseInt(expandedHex.slice(4, 6), 16),
      };
    };
    const toHexColor = ({ r, g, b }: { r: number; g: number; b: number }) =>
      `#${[r, g, b]
        .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
        .join("")}`;
    const blendWeightedMobileColor = (sources: Array<{ value: number; color: string }>, fallbackColor: string) => {
      const activeSources = sources.filter((source) => source.value > 0);
      const totalValue = activeSources.reduce((sum, source) => sum + source.value, 0);

      if (totalValue <= 0) return fallbackColor;

      const blendedRgb = activeSources.reduce(
        (accumulator, source) => {
          const weight = source.value / totalValue;
          const rgb = parseHexColor(source.color);

          return {
            r: accumulator.r + rgb.r * weight,
            g: accumulator.g + rgb.g * weight,
            b: accumulator.b + rgb.b * weight,
          };
        },
        { r: 0, g: 0, b: 0 }
      );

      return toHexColor(blendedRgb);
    };
    const mobileHomeIconColor = blendWeightedMobileColor(
      [
        { value: homeSolarCircumference || 0, color: mobileSolarColor },
        { value: homeBatteryCircumference || 0, color: mobileBatteryOutColor },
        { value: homeNonFossilCircumference || 0, color: mobileNonFossilColor },
        { value: homeGridCircumference || 0, color: mobileGridConsumptionColor },
      ],
      mobileHomeColor
    );
    const mobileCircleCircumference = 2 * Math.PI * mobileR;
    const toMobileCircumference = (value: number) =>
      ((Number.isFinite(value) ? value : 0) / circleCircumference) * mobileCircleCircumference;
    const mobileHomeSolarCircumference = toMobileCircumference(homeSolarCircumference || 0);
    const mobileHomeBatteryCircumference = toMobileCircumference(homeBatteryCircumference || 0);
    const mobileHomeNonFossilCircumference = toMobileCircumference(homeNonFossilCircumference || 0);
    const mobileHomeGridCircumference = toMobileCircumference(homeGridCircumference || 0);
    const mobileHomeGridVisibleCircumference =
      mobileHomeGridCircumference > 0
        ? mobileHomeGridCircumference
        : mobileCircleCircumference - mobileHomeSolarCircumference - mobileHomeBatteryCircumference;
    const mobileHomeGridGapCircumference = mobileCircleCircumference - mobileHomeGridVisibleCircumference;

    return html`
      <ha-card
        .header=${this._config.title}
        class=${this._config.full_size ? "full-size" : ""}
        style=${this._config.style_ha_card ? this._config.style_ha_card : ""}
      >
        <div
          class="card-content desktop-layout ${this._config.full_size ? "full-size" : ""}"
          id="power-flow-card-plus"
          style=${this._config.style_card_content ? this._config.style_card_content : ""}
        >
          ${solar.has || individualObjs?.some((individual) => individual?.has) || nonFossil.hasPercentage
            ? html`<div class="row">
                ${nonFossilElement(this, this._config, {
                  entities,
                  grid,
                  newDur,
                  nonFossil,
                  templatesObj,
                })}
                ${solar.has
                  ? solarElement(this, this._config, {
                      entities,
                      solar,
                      templatesObj,
                    })
                  : individualObjs?.some((individual) => individual?.has)
                  ? html`<div class="spacer"></div>`
                  : ""}
                ${individualFieldLeftTop
                  ? individualLeftTopElement(this, this._config, {
                      individualObj: individualFieldLeftTop,
                      displayState: getIndividualDisplayState(individualFieldLeftTop),
                      newDur,
                      templatesObj,
                    })
                  : html`<div class="spacer"></div>`}
                ${checkHasRightIndividual(individualObjs)
                  ? individualRightTopElement(this, this._config, {
                      displayState: getIndividualDisplayState(individualFieldRightTop),
                      individualObj: individualFieldRightTop,
                      newDur,
                      templatesObj,
                      battery,
                      individualObjs,
                    })
                  : html``}
              </div>`
            : html``}
          <div class="row">
            ${grid.has
              ? gridElement(this, this._config, {
                  entities,
                  grid,
                  templatesObj,
                })
              : html`<div class="spacer"></div>`}
            <div class="spacer"></div>
            ${!entities.home?.hide
              ? homeElement(this, this._config, {
                  circleCircumference,
                  entities,
                  grid,
                  home,
                  homeBatteryCircumference,
                  homeGridCircumference,
                  homeNonFossilCircumference,
                  homeSolarCircumference,
                  newDur,
                  templatesObj,
                  homeUsageToDisplay,
                  individual: individualObjs,
                })
              : html`<div class="spacer"></div>`}
            ${checkHasRightIndividual(individualObjs) ? html` <div class="spacer"></div>` : html``}
          </div>
          ${battery.has || checkHasBottomIndividual(individualObjs)
            ? html`<div class="row">
                <div class="spacer"></div>
                ${battery.has ? batteryElement(this, this._config, { battery, entities }) : html`<div class="spacer"></div>`}
                ${individualFieldLeftBottom
                  ? individualLeftBottomElement(this, this._config, {
                      displayState: getIndividualDisplayState(individualFieldLeftBottom),
                      individualObj: individualFieldLeftBottom,
                      newDur,
                      templatesObj,
                    })
                  : html`<div class="spacer"></div>`}
                ${checkHasRightIndividual(individualObjs)
                  ? individualRightBottomElement(this, this._config, {
                      displayState: getIndividualDisplayState(individualFieldRightBottom),
                      individualObj: individualFieldRightBottom,
                      newDur,
                      templatesObj,
                      battery,
                      individualObjs,
                    })
                  : html``}
              </div>`
            : html`<div class="spacer"></div>`}
          ${flowElement(this._config, {
            battery,
            grid,
            individual: individualObjs,
            newDur,
            solar,
          })}
        </div>
        <div class="card-content mobile-layout ${this._config.full_size ? "full-size" : ""}">
          <svg
            viewBox="0 0 ${mobileViewBoxWidth} ${mobileViewBoxHeight}"
            xmlns="http://www.w3.org/2000/svg"
            style="display:block; width:${mobileViewBoxWidth}px; height:${mobileViewBoxHeight}px;"
          >
            ${solar.has && battery.has && showLine(this._config, solar.state.toBattery || 0)
              ? svg`
                  <path
                    id="mobile-solar-battery-path"
                    d="M ${mobileSolarCx},${mobileSolarCy + mobileR} L ${mobileBatteryCx},${mobileBatteryCy - mobileR}"
                    style="fill: none; stroke: ${mobileSolarColor}; stroke-width: ${mobileStrokeWidth}; opacity: ${mobileLineOpacity(solar.state.toBattery || 0)};"
                  />
                  ${checkShouldShowDots(this._config) && (solar.state.toBattery || 0) > 0
                    ? svg`<circle r="${mobileDotRadius}" style="fill: ${mobileSolarColor};">
                        <animateMotion
                          dur="${newDur.solarToBattery}s"
                          repeatCount="indefinite"
                          calcMode="linear"
                        >
                          <mpath href="#mobile-solar-battery-path" />
                        </animateMotion>
                      </circle>`
                    : svg``}
                `
              : svg``}

            ${solar.has && grid.hasReturnToGrid && showLine(this._config, solar.state.toGrid || 0)
              ? svg`
                  <path
                    id="mobile-solar-grid-path"
                    d="M ${mobileSolarCx},${mobileSolarCy + mobileR} L ${mobileSolarCx},${mobileGridCy} L ${mobileGridCx - mobileR},${mobileGridCy}"
                    style="fill: none; stroke: ${mobileGridReturnColor}; stroke-width: ${mobileStrokeWidth}; opacity: ${mobileLineOpacity(solar.state.toGrid || 0)};"
                  />
                  ${checkShouldShowDots(this._config) && (solar.state.toGrid || 0) > 0
                    ? svg`<circle r="${mobileDotRadius}" style="fill: ${mobileGridReturnColor};">
                        <animateMotion
                          dur="${newDur.solarToGrid}s"
                          repeatCount="indefinite"
                          calcMode="linear"
                        >
                          <mpath href="#mobile-solar-grid-path" />
                        </animateMotion>
                      </circle>`
                    : svg``}
                `
              : svg``}

            ${solar.has && !entities.home?.hide && showLine(this._config, solar.state.toHome || 0)
              ? svg`
                  <path
                    id="mobile-solar-home-path"
                    d="M ${mobileSolarCx},${mobileSolarCy + mobileR} L ${mobileSolarCx},${mobileHomeCy} L ${mobileHomeCx + mobileR},${mobileHomeCy}"
                    style="fill: none; stroke: ${mobileSolarColor}; stroke-width: ${mobileStrokeWidth}; opacity: ${mobileLineOpacity(solar.state.toHome || 0)};"
                  />
                  ${checkShouldShowDots(this._config) && (solar.state.toHome || 0) > 0
                    ? svg`<circle r="${mobileDotRadius}" style="fill: ${mobileSolarColor};">
                        <animateMotion
                          dur="${newDur.solarToHome}s"
                          repeatCount="indefinite"
                          calcMode="linear"
                        >
                          <mpath href="#mobile-solar-home-path" />
                        </animateMotion>
                      </circle>`
                    : svg``}
                `
              : svg``}

            ${solar.has
              ? svg`
                  <g class="mobile-solar-group" transform="translate(${mobileSolarCx}, ${mobileSolarCy})">
                    <g transform="translate(${mobileIconX}, ${mobileIconY}) scale(${mobileIconSize / 24})">
                      <path d="${mdiSolarPower}" style="fill: ${mobileSolarColor}; stroke: none;" />
                    </g>
                    <text
                      x="0"
                      y="${mobileValueY}"
                      text-anchor="middle"
                      dominant-baseline="hanging"
                      style="fill: #000;"
                      font-size="${mobileFontSizeLg}"
                    >
                      ${mobileSolarValue}
                    </text>
                    <circle
                      cx="0"
                      cy="0"
                      r="${mobileR}"
                        style="fill: none; stroke: ${mobileSolarColor}; stroke-width: ${mobileStrokeWidth};"
                    />
                  </g>
                `
              : svg``}

            ${grid.has
              ? svg`
                  <g class="mobile-grid-group" transform="translate(${mobileGridCx}, ${mobileGridCy})">
                    <g transform="translate(${mobileIconX}, ${mobileIconY}) scale(${mobileIconSize / 24})">
                      <path d="${mdiTransmissionTower}" style="fill: ${mobileGridIconColor}; stroke: none;" />
                    </g>
                    <text
                      x="0"
                      y="${mobileValueY}"
                      text-anchor="middle"
                      dominant-baseline="hanging"
                      style="fill: #000;"
                      font-size="${mobileGridValueFontSize}"
                    >
                      ${mobileShowGridReturn && mobileShowGridConsumption
                        ? svg`
                            <tspan x="0" dy="0" style="fill: ${mobileGridReturnTextColor};">← ${mobileGridReturnValue}</tspan>
                            <tspan x="0" dy="${mobileGridValueLineGap}" style="fill: ${mobileGridConsumptionTextColor};">→ ${mobileGridConsumptionValue}</tspan>
                          `
                        : mobileShowGridReturn
                        ? svg`<tspan x="0" dy="0" style="fill: ${mobileGridReturnTextColor};">← ${mobileGridReturnValue}</tspan>`
                        : mobileShowGridConsumption
                        ? svg`<tspan x="0" dy="0" style="fill: ${mobileGridConsumptionTextColor};">→ ${mobileGridConsumptionValue}</tspan>`
                        : svg`<tspan x="0" dy="0">${displayValue(this.hass, this._config, 0, { watt_threshold: this._config.watt_threshold })}</tspan>`}
                    </text>
                    <circle
                      cx="0"
                      cy="0"
                      r="${mobileR}"
                      style="fill: none; stroke: ${mobileGridCircleColor}; stroke-width: ${mobileStrokeWidth};"
                    />
                  </g>
                `
              : svg``}

            ${svg`
                <g class="mobile-home-group" transform="translate(${mobileHomeCx}, ${mobileHomeCy})">
                  <g transform="translate(${mobileIconX}, ${mobileIconY}) scale(${mobileIconSize / 24})">
                    <path d="${mdiHome}" style="fill: ${mobileHomeIconColor}; stroke: none;" />
                  </g>
                  <text
                    x="0"
                    y="${mobileValueY}"
                    text-anchor="middle"
                    dominant-baseline="hanging"
                    style="fill: #000;"
                      font-size="${mobileFontSizeLg}"
                  >
                    ${homeUsageToDisplay}
                  </text>
                  ${mobileHomeSolarCircumference > 0
                    ? svg`<circle
                        cx="0"
                        cy="0"
                        r="${mobileR}"
                        stroke-dasharray="${mobileHomeSolarCircumference} ${mobileCircleCircumference - mobileHomeSolarCircumference}"
                        stroke-dashoffset="-${mobileCircleCircumference - mobileHomeSolarCircumference}"
                        shape-rendering="geometricPrecision"
                        style="fill: none; stroke: ${mobileSolarColor}; stroke-width: ${mobileStrokeWidth};"
                      />`
                    : svg``}
                  ${mobileHomeBatteryCircumference > 0
                    ? svg`<circle
                        cx="0"
                        cy="0"
                        r="${mobileR}"
                        stroke-dasharray="${mobileHomeBatteryCircumference} ${mobileCircleCircumference - mobileHomeBatteryCircumference}"
                        stroke-dashoffset="-${mobileCircleCircumference - mobileHomeBatteryCircumference - mobileHomeSolarCircumference}"
                        shape-rendering="geometricPrecision"
                        style="fill: none; stroke: ${mobileBatteryOutColor}; stroke-width: ${mobileStrokeWidth};"
                      />`
                    : svg``}
                  ${mobileHomeNonFossilCircumference > 0
                    ? svg`<circle
                        cx="0"
                        cy="0"
                        r="${mobileR}"
                        stroke-dasharray="${mobileHomeNonFossilCircumference} ${mobileCircleCircumference - mobileHomeNonFossilCircumference}"
                        stroke-dashoffset="-${
                          mobileCircleCircumference -
                          mobileHomeNonFossilCircumference -
                          mobileHomeBatteryCircumference -
                          mobileHomeSolarCircumference
                        }"
                        shape-rendering="geometricPrecision"
                        style="fill: none; stroke: ${mobileNonFossilColor}; stroke-width: ${mobileStrokeWidth};"
                      />`
                    : svg``}
                  <circle
                    cx="0"
                    cy="0"
                    r="${mobileR}"
                    stroke-dasharray="${mobileHomeGridVisibleCircumference} ${mobileHomeGridGapCircumference}"
                    stroke-dashoffset="0"
                    shape-rendering="geometricPrecision"
                    style="fill: none; stroke: ${mobileGridConsumptionColor}; stroke-width: ${mobileStrokeWidth};"
                  />
                  <text
                    x="0"
                    y="${mobileLabelY}"
                    text-anchor="middle"
                    dominant-baseline="hanging"
                    style="fill: ${mobileSecondaryTextColor};"
                      font-size="${mobileFontSizeSm}"
                  >${home.name}</text>
                </g>
              `}

            ${battery.has
              ? svg`
                  <g class="mobile-battery-group" transform="translate(${mobileBatteryCx}, ${mobileBatteryCy})">
                    <g transform="translate(${mobileIconX}, ${mobileIconY}) scale(${mobileIconSize / 24})">
                      <path d="${mobileBatteryIconPath}" style="fill: ${mobileBatteryColor}; stroke: none;" />
                    </g>
                    <text
                      x="0"
                      y="${mobileValueY}"
                      text-anchor="middle"
                      dominant-baseline="hanging"
                      style="fill: #000;"
                      font-size="${mobileBatteryValueFontSize}"
                    >
                      ${mobileShowBatteryIn && mobileShowBatteryOut
                        ? svg`
                            <tspan x="0" dy="0" style="fill: ${mobileBatteryInTextColor};">↓ ${mobileBatteryInValue}</tspan>
                            <tspan x="0" dy="${mobileBatteryValueLineGap}" style="fill: ${mobileBatteryOutTextColor};">↑ ${mobileBatteryOutValue}</tspan>
                          `
                        : mobileShowBatteryIn
                        ? svg`<tspan x="0" dy="0" style="fill: ${mobileBatteryInTextColor};">↓ ${mobileBatteryInValue}</tspan>`
                        : mobileShowBatteryOut
                        ? svg`<tspan x="0" dy="0" style="fill: ${mobileBatteryOutTextColor};">↑ ${mobileBatteryOutValue}</tspan>`
                        : svg`<tspan x="0" dy="0">${displayValue(this.hass, this._config, 0, { watt_threshold: this._config.watt_threshold })}</tspan>`}
                    </text>
                    <circle
                      cx="0"
                      cy="0"
                      r="${mobileR}"
                      style="fill: none; stroke: ${mobileBatteryCircleColor}; stroke-width: ${mobileStrokeWidth};"
                    />
                  </g>
                `
              : svg``}

          </svg>
        </div>
        ${dashboardLinkElement(this._config, this.hass)}
      </ha-card>
    `;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
      
    if (!this._config || !this.hass) {
      return;
    }

    const elem = this?.shadowRoot?.querySelector("#power-flow-card-plus");
    const widthStr = elem ? getComputedStyle(elem).getPropertyValue("width") : "0px";
    this._width = parseInt(widthStr.replace("px", ""), 10);

    this._tryConnectAll();
    this._drawMobileFlowLines();
  }

  private _drawMobileFlowLines() {
    // Only draw in mobile view
    if (this._width > 1024) return;

    const canvas = this.batteryToHomeFlow as HTMLCanvasElement;
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;

    // Get grid and home circle elements to calculate line position
    const gridCircle = this.shadowRoot?.querySelector(".mobile-circles-container .circle-container:nth-child(3)") as HTMLElement;
    const homeCircle = this.shadowRoot?.querySelector(".mobile-circles-container .circle-container:nth-child(5)") as HTMLElement;
    
    if (!gridCircle || !homeCircle) return;

    // Set canvas dimensions to match container
    const container = this.shadowRoot?.querySelector(".mobile-circles-container") as HTMLElement;
    if (!container) return;

    canvas.width = container.offsetWidth;
    canvas.height = 160 + 18; // one row height + gap

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw line from grid circle center to home circle center
    const gridRect = gridCircle.getBoundingClientRect();
    const homeRect = homeCircle.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate relative positions within canvas
    const gridCenterX = (gridRect.left - containerRect.left) + gridRect.width / 2;
    const gridCenterY = (gridRect.top - containerRect.top) + gridRect.height / 2;
    const homeCenterX = (homeRect.left - containerRect.left) + homeRect.width / 2;
    const homeCenterY = (homeRect.top - containerRect.top) + homeRect.height / 2;

    // Get stroke color from CSS variable or default
    const computedStyle = getComputedStyle(container);
    const strokeColor = computedStyle.getPropertyValue("--battery-home-color") || "rgb(150, 150, 150)";

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gridCenterX, gridCenterY);
    ctx.lineTo(homeCenterX, homeCenterY);
    ctx.stroke();
  }

  private _tryConnectAll() {
    const { entities } = this._config;
    const templatesObj = {
      gridSecondary: entities.grid?.secondary_info?.template,
      solarSecondary: entities.solar?.secondary_info?.template,
      homeSecondary: entities.home?.secondary_info?.template,
      individualSecondary: entities.individual?.map((individual) => individual.secondary_info?.template),
      nonFossilFuelSecondary: entities.fossil_fuel_percentage?.secondary_info?.template,
    };

    for (const [key, value] of Object.entries(templatesObj)) {
      if (value) {
        if (Array.isArray(value)) {
          const individualKeys = ["left-top", "left-bottom", "right-top", "right-bottom"];
          value.forEach((template, index) => {
            if (template) this._tryConnect(template, `${individualKeys[index]}Secondary`);
          });
        } else {
          this._tryConnect(value, key);
        }
      }
    }
  }

  private async _tryConnect(inputTemplate: string, topic: string): Promise<void> {
    if (!this.hass || !this._config || this._unsubRenderTemplates?.get(topic) !== undefined || inputTemplate === "") {
      return;
    }

    try {
      const sub = subscribeRenderTemplate(
        this.hass.connection,
        (result) => {
          this._templateResults[topic] = result;
        },
        {
          template: inputTemplate,
          entity_ids: this._config.entity_id,
          variables: {
            config: this._config,
            user: this.hass.user!.name,
          },
          strict: true,
        }
      );
      this._unsubRenderTemplates?.set(topic, sub);
      await sub;
    } catch (_err) {
      this._templateResults = {
        ...this._templateResults,
        [topic]: {
          result: inputTemplate,
          listeners: { all: false, domains: [], entities: [], time: false },
        },
      };
      this._unsubRenderTemplates?.delete(topic);
    }
  }

  private async _tryDisconnectAll() {
    const { entities } = this._config;
    const templatesObj = {
      gridSecondary: entities.grid?.secondary_info?.template,
      solarSecondary: entities.solar?.secondary_info?.template,
      homeSecondary: entities.home?.secondary_info?.template,
      individualSecondary: entities.individual?.map((individual) => individual.secondary_info?.template),
    };

    for (const [key, value] of Object.entries(templatesObj)) {
      if (value) {
        this._tryDisconnect(key);
      }
    }
  }

  private async _tryDisconnect(topic: string): Promise<void> {
    const unsubRenderTemplate = this._unsubRenderTemplates?.get(topic);
    if (!unsubRenderTemplate) {
      return;
    }

    try {
      const unsub = await unsubRenderTemplate;
      unsub();
      this._unsubRenderTemplates?.delete(topic);
    } catch (err: any) {
      if (err.code === "not_found" || err.code === "template_error") {
        // If we get here, the connection was probably already closed. Ignore.
      } else {
        throw err;
      }
    }
  }

  static styles = styles;
}

function sortIndividualObjects(individualObjs: IndividualObject[]) {
  const sorted = [...individualObjs];
  sorted
    .sort((a, b) => {
      return (a.state || 0) - (b.state || 0);
    })
    .reverse();
  return sorted;
}
