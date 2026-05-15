import { html } from "lit";
import { PowerFlowCardPlus } from "../power-flow-card-plus";
import { displayValue } from "../utils/displayValue";
import { generalSecondarySpan } from "./spans/generalSecondarySpan";
import { TemplatesObj } from "../type";
import { ConfigEntities, PowerFlowCardPlusConfig } from "../power-flow-card-plus-config";
import { renderEntitySvgIcon } from "./svgIcon";

export const gridElement = (
  main: PowerFlowCardPlus,
  config: PowerFlowCardPlusConfig,
  { entities, grid, templatesObj }: { entities: ConfigEntities; grid: any; templatesObj: TemplatesObj }
) => {
  const gridReturnArrowIcon = entities.grid?.invert_arrow_direction ? "mdi:arrow-right" : "mdi:arrow-left";
  const gridConsumptionArrowIcon = entities.grid?.invert_arrow_direction ? "mdi:arrow-left" : "mdi:arrow-right";
  const outageTarget = grid.powerOutage?.entityGenerator ?? entities.grid?.power_outage?.entity;
  const gridPrimaryTarget =
    grid.powerOutage?.isOutage && outageTarget
      ? outageTarget
      : typeof entities.grid!.entity === "string"
      ? entities.grid!.entity
      : entities.grid!.entity.consumption!;
  const gridReturnTarget = typeof entities.grid!.entity === "string" ? entities.grid!.entity : entities.grid!.entity.production!;
  const gridConsumptionTarget = typeof entities.grid!.entity === "string" ? entities.grid!.entity : entities.grid!.entity.consumption!;

  return html`<div class="circle-container grid">
    <div
      class="circle"
      @click=${(e: { stopPropagation: () => void; target: HTMLElement }) => {
        main.openDetails(e, undefined, gridPrimaryTarget);
      }}
      @keyDown=${(e: { key: string; stopPropagation: () => void; target: HTMLElement }) => {
        if (e.key === "Enter") {
          main.openDetails(e, undefined, gridPrimaryTarget);
        }
      }}
    >
      ${generalSecondarySpan(main.hass, main, config, templatesObj, grid, "grid")}
      <span
        class="grid-main-icon"
        tabindex="0"
        @click=${(e: { stopPropagation: () => void; target: HTMLElement }) => {
          main.openDetails(e, entities.grid?.tap_action, gridPrimaryTarget);
        }}
        @keyDown=${(e: { key: string; stopPropagation: () => void; target: HTMLElement }) => {
          if (e.key === "Enter") {
            main.openDetails(e, entities.grid?.tap_action, gridPrimaryTarget);
          }
        }}
      >
        ${renderEntitySvgIcon(grid.icon, "grid-icon")}
      </span>
      ${(entities.grid?.display_state === "two_way" ||
        entities.grid?.display_state === undefined ||
        (entities.grid?.display_state === "one_way_no_zero" && (grid.state.toGrid ?? 0) > 0) ||
        (entities.grid?.display_state === "one_way" && (grid.state.fromGrid === null || grid.state.fromGrid === 0) && grid.state.toGrid !== 0)) &&
      grid.state.toGrid !== null &&
      !grid.powerOutage.isOutage
        ? html`<span
            class="return"
            @click=${(e: { stopPropagation: () => void; target: HTMLElement }) => {
              main.openDetails(e, undefined, gridReturnTarget);
            }}
            @keyDown=${(e: { key: string; stopPropagation: () => void; target: HTMLElement }) => {
              if (e.key === "Enter") {
                main.openDetails(e, undefined, gridReturnTarget);
              }
            }}
          >
            <ha-icon class="small" .icon=${gridReturnArrowIcon}></ha-icon>

            ${displayValue(main.hass, config, grid.state.toGrid, {
              unit: grid.unit,
              unitWhiteSpace: grid.unit_white_space,
              decimals: grid.decimals,
              watt_threshold: config.watt_threshold,
            })}
          </span>`
        : null}
      ${((entities.grid?.display_state === "two_way" ||
        entities.grid?.display_state === undefined ||
        (entities.grid?.display_state === "one_way_no_zero" && grid.state.fromGrid > 0) ||
        (entities.grid?.display_state === "one_way" && (grid.state.toGrid === null || grid.state.toGrid === 0))) &&
        grid.state.fromGrid !== null &&
        !grid.powerOutage.isOutage) ||
      (grid.powerOutage.isOutage && !!grid.powerOutage.entityGenerator)
        ? html` <span
            class="consumption"
            @click=${(e: { stopPropagation: () => void; target: HTMLElement }) => {
              main.openDetails(e, undefined, gridConsumptionTarget);
            }}
            @keyDown=${(e: { key: string; stopPropagation: () => void; target: HTMLElement }) => {
              if (e.key === "Enter") {
                main.openDetails(e, undefined, gridConsumptionTarget);
              }
            }}
          >
            <ha-icon class="small" .icon=${gridConsumptionArrowIcon}></ha-icon>
            ${displayValue(main.hass, config, grid.state.fromGrid, {
              unit: grid.unit,
              unitWhiteSpace: grid.unit_white_space,
              decimals: grid.decimals,
              watt_threshold: config.watt_threshold,
            })}
          </span>`
        : ""}
      ${grid.powerOutage?.isOutage && !grid.powerOutage?.entityGenerator ? html`<span class="grid power-outage">${grid.powerOutage.name}</span>` : ""}
    </div>
    <span class="label">${grid.name}</span>
  </div>`;
};
