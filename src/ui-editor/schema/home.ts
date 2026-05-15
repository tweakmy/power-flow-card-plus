import { getBaseMainConfigSchema, secondaryInfoSchema, tapActionSchema } from "./_schema-base";
import localize from "@/localize/localize";

const mainSchema = {
  ...getBaseMainConfigSchema(),
  schema: [
    ...getBaseMainConfigSchema().schema,
    {
      name: "color_value",
      label: "Color Value",
      selector: {
        select: {
          options: [
            { value: true, label: "Color dynamically" },
            { value: false, label: "Do Not Color" },
            { value: "solar", label: "Solar" },
            { value: "grid", label: "Grid" },
            { value: "battery", label: "Battery" },
          ],
          custom_value: true,
        },
      },
    },
    {
      name: "color_icon",
      label: "Color Icon",
      selector: {
        select: {
          options: [
            { value: true, label: "Color dynamically" },
            { value: false, label: "Do Not Color" },
            { value: "solar", label: "Solar" },
            { value: "grid", label: "Grid" },
            { value: "battery", label: "Battery" },
          ],
          custom_value: true,
        },
      },
    },
    {
      name: "circle_animation",
      label: "Circle Animation",
      default: true,
      selector: { boolean: {} },
    },
    {
      name: "subtract_individual",
      label: "Subtract Individual",
      selector: { boolean: {} },
    },
    {
      name: "override_state",
      label: "Override State (With Home Entity)",
      selector: { boolean: {} },
    },
    {
      name: "use_metadata",
      label: "Use Metadata",
      selector: { boolean: {} },
    },
    {
      name: "hide",
      label: "Hide Home",
      selector: { boolean: {} },
    },
    {
      name: "phase_power.red",
      label: "Phase Power Red",
      selector: { entity: {} },
    },
    {
      name: "phase_power.yellow",
      label: "Phase Power Yellow",
      selector: { entity: {} },
    },
    {
      name: "phase_power.blue",
      label: "Phase Power Blue",
      selector: { entity: {} },
    },
    {
      name: "charger.entity",
      label: "Charger Power Entity",
      selector: { entity: {} },
    },
    {
      name: "charger.icon",
      label: "Charger Icon",
      selector: { icon: {} },
    },
    {
      name: "charger.status_entity",
      label: "Charger Status Entity",
      selector: { entity: {} },
    },
    {
      name: "charger.state_charging",
      label: "Charger Active State",
      selector: { text: {} },
    },
    {
      name: "charger.invert_status",
      label: "Invert Charger Status",
      selector: { boolean: {} },
    },
    {
      name: "charger.unit_of_measurement",
      label: "Charger Unit",
      selector: { text: {} },
    },
    {
      name: "charger.decimals",
      label: "Charger Decimals",
      selector: { number: { mode: "box", min: 0, max: 6, step: 1 } },
    },
    {
      name: "charger.unit_white_space",
      label: "Charger Unit White Space",
      default: true,
      selector: { boolean: {} },
    },
    {
      name: "charger.tap_action",
      label: "Charger Tap Action",
      selector: { ui_action: {} },
    },
  ],
};

export const homeSchema = [
  {
    name: "entity",
    selector: { entity: {} },
  },
  mainSchema,
  {
    title: localize("editor.secondary_info"),
    name: "secondary_info",
    type: "expandable",
    schema: secondaryInfoSchema,
  },
  {
    title: localize("editor.tap_action"),
    name: "",
    type: "expandable",
    schema: tapActionSchema,
  },
] as const;
