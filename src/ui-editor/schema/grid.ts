import {
  getEntityCombinedSelectionSchema,
  getEntitySeparatedSelectionSchema,
  secondaryInfoSchema,
  getBaseMainConfigSchema,
  customColorsSchema,
  tapActionSchema,
} from "./_schema-base";
import localize from "@/localize/localize";

const mainSchema = {
  ...getBaseMainConfigSchema("grid"),
  schema: [
    ...getBaseMainConfigSchema("grid").schema,
    {
      name: "invert_state",
      label: "Invert State",
      selector: { boolean: {} },
    },
    {
      name: "use_metadata",
      label: "Use Metadata",
      selector: { boolean: {} },
    },
    {
      name: "color_value",
      label: "Color of Value",
      selector: { boolean: {} },
    },
    {
      name: "invert_arrow_direction",
      label: "Invert Arrow Direction",
      selector: { boolean: {} },
    },
  ],
};

const powerOutageGridSchema = [
  {
    type: "grid",
    column_min_width: "200px",
    schema: [
      { name: "entity", selector: { entity: {} } },
      { name: "entity_generator", label: "Generator Entity", selector: { entity: {} } },
      { name: "label_alert", label: "Outage Label", selector: { text: {} } },
      { name: "icon_alert", label: "Outage Icon", selector: { icon: {} } },
      { name: "state_alert", label: "Outage State", selector: { text: {} } },
    ],
  },
] as const;

export const gridSchema = [
  getEntityCombinedSelectionSchema(),
  getEntitySeparatedSelectionSchema(),
  mainSchema,
  customColorsSchema,
  {
    title: localize("editor.secondary_info"),
    name: "secondary_info",
    type: "expandable",
    schema: secondaryInfoSchema,
  },
  {
    title: localize("editor.power_outage"),
    name: "power_outage",
    type: "expandable",
    schema: powerOutageGridSchema,
  },
  {
    title: "Desired Peak Demand Export Limit",
    name: "desired_peak_demand_export_limit",
    type: "expandable",
    schema: [
      {
        type: "grid",
        column_min_width: "200px",
        schema: [
          { name: "entity", label: "Entity", selector: { entity: {} } },
          { name: "label", label: "Label", selector: { text: {} } },
          { name: "unit", label: "Unit", selector: { text: {} } },
        ],
      },
    ],
  },
  {
    title: "Current Inverter Export Limit",
    name: "current_inverter_export_limit",
    type: "expandable",
    schema: [
      {
        type: "grid",
        column_min_width: "200px",
        schema: [
          { name: "entity", label: "Entity", selector: { entity: {} } },
          { name: "label", label: "Label", selector: { text: {} } },
          { name: "unit", label: "Unit", selector: { text: {} } },
        ],
      },
    ],
  },
  {
    title: localize("editor.tap_action"),
    name: "",
    type: "expandable",
    schema: tapActionSchema,
  },
] as const;
