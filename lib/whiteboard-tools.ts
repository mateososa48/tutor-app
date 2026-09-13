export type WhiteboardToolName =
  | "start_new_problem"
  | "start_board_section"
  | "add_problem_setup"
  | "add_equation_sequence"
  | "draw_equation_step"
  | "add_text_note"
  | "add_callout"
  | "add_student_attempt"
  | "highlight_step"
  | "cross_out_step"
  | "draw_fraction"
  | "add_number_line"
  | "draw_figure"
  | "draw_angle"
  | "draw_array"
  | "add_area_model"
  | "draw_balance"
  | "draw_bar_chart"
  | "add_table"
  | "add_coordinate_axes"
  | "plot_points"
  | "add_worked_example_box"
  | "add_function_graph"
  | "add_two_column_comparison"
  | "add_vector_diagram"
  | "add_process_map"
  | "draw_sketch"
  | "clear_whiteboard";

export type CalloutStyle = "hint" | "correct" | "wrong" | "warning" | "important" | "remember";

const COLUMN = {
  type: "string",
  enum: ["left", "right"],
  description: "Which column of the board. Default 'left'. Use 'right' to sit a picture beside the equations.",
} as const;

export const WHITEBOARD_TOOL_DECLARATIONS = [
  // ── Structure ─────────────────────────────────────────────────────────────
  {
    name: "start_new_problem",
    description:
      "Clear the board and write a heading. Use it every time the problem or topic changes. Prefer this over clear_whiteboard.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short heading, 160 chars or fewer, e.g. 'Solving 2x + 3 = 11', 'One half', 'Forces on a sled'.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "start_board_section",
    description:
      "Write a subheading further down the same board, without clearing. Use when the same problem moves to a new phase ('Check the answer', 'Your turn'). The canvas is infinite; never clear to make room.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short subheading, 160 chars or fewer." },
      },
      required: ["title"],
    },
  },
  {
    name: "add_problem_setup",
    description:
      "A boxed 'Goal / Givens / Unknown / Plan' block. Use at the start of word problems, physics, and multi-step algebra so the setup is explicit before any computation.",
    parameters: {
      type: "object",
      properties: {
        goal: { type: "string", description: "What we are solving for, one line, 320 chars max." },
        givens: {
          type: "string",
          description: "Optional pipe-separated facts, e.g. 'v0 = 5 m/s | a = 9.8 m/s² | t = 2 s'. 800 chars max.",
        },
        unknowns: { type: "string", description: "Optional comma-separated unknowns. 320 chars max." },
        plan: { type: "string", description: "Optional one-line strategy. 600 chars max." },
        column: COLUMN,
      },
      required: ["goal"],
    },
  },

  // ── Equations ─────────────────────────────────────────────────────────────
  {
    name: "draw_equation_step",
    description:
      "Write ONE equation line in typeset math. The default move while solving live: write the single next line as the student reaches it, then stop and let them take the next step.",
    parameters: {
      type: "object",
      properties: {
        latex: { type: "string", description: "LaTeX without $$ delimiters, e.g. '2x = 8', '\\frac{3}{4} + \\frac{1}{4}'. 600 chars max." },
        annotation: {
          type: "string",
          description: "Optional 2-6 word note beside the line, e.g. 'subtract 3 from both sides'. 160 chars max.",
        },
        column: COLUMN,
      },
      required: ["latex"],
    },
  },
  {
    name: "add_equation_sequence",
    description:
      "Several equation lines as one stacked block. Only for recapping steps the student has ALREADY worked through, or a worked parallel example. Never for steps they have not reached: use draw_equation_step for the live next line.",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "string",
          description: "Pipe-separated LaTeX lines without $$, e.g. 'x^2 + 5x + 6 = 0 | (x+2)(x+3) = 0 | x = -2 \\text{ or } x = -3'. 1600 chars max.",
        },
        annotations: {
          type: "string",
          description: "Optional pipe-separated notes, one per step; leave a slot empty to skip: 'factor || solve'. 800 chars max.",
        },
        title: { type: "string", description: "Optional short title above the block. 160 chars max." },
        column: COLUMN,
      },
      required: ["steps"],
    },
  },
  {
    name: "add_student_attempt",
    description:
      "Write what the student SAID or TRIED, in their own handwriting style and marked as theirs. Use every time they give a substantive answer, right or wrong. Follow with highlight_step (right) or cross_out_step plus the corrected line (wrong).",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The attempt, verbatim or lightly paraphrased. 1200 chars max." },
        column: COLUMN,
      },
      required: ["text"],
    },
  },
  {
    name: "highlight_step",
    description:
      "Ring, underline, or box an equation line that is already on the board. Sparingly: 'this is the key line', 'notice this cancels'.",
    parameters: {
      type: "object",
      properties: {
        step_label: {
          type: "string",
          description: "PREFERRED. A unique fragment of the line's LaTeX, e.g. 'x=4'. Newest match wins. 200 chars max.",
        },
        step_index: { type: "number", description: "Fallback only: zero-based index of the equation line." },
        style: { type: "string", enum: ["circle", "underline", "box"], description: "'circle' = hand-drawn ring, 'underline', 'box' = dashed box." },
      },
      required: ["style"],
    },
  },
  {
    name: "cross_out_step",
    description:
      "Strike through an equation line that is already on the board: a wrong attempt, or a path that does not work. Usually paired with add_student_attempt before and the corrected line after.",
    parameters: {
      type: "object",
      properties: {
        step_label: { type: "string", description: "PREFERRED. A unique fragment of the line's LaTeX. 200 chars max." },
        step_index: { type: "number", description: "Fallback only: zero-based index." },
      },
      required: [],
    },
  },

  // ── Pictures (use these whenever an idea has a picture) ───────────────────
  {
    name: "draw_fraction",
    description:
      "Draw a fraction as a picture: a circle cut into equal slices with some shaded, or a bar cut into equal pieces. THE tool for anything about fractions, halves, quarters, sharing, or parts of a whole. Improper fractions get extra wholes. Give a second fraction to draw two models side by side (equivalent fractions, comparing, adding). Never describe a fraction picture in words; draw it.",
    parameters: {
      type: "object",
      properties: {
        fraction: { type: "string", description: "The fraction, e.g. '3/4', '1/2', '5/4', '2'. Denominator 24 or less." },
        model: { type: "string", enum: ["circle", "bar"], description: "'circle' (pie, default) or 'bar' (strip). Bars compare better side by side." },
        second_fraction: { type: "string", description: "Optional second fraction drawn next to the first with the same model, e.g. '6/8' beside '3/4'." },
        label: { type: "string", description: "Optional caption under the picture, e.g. 'one half of the pizza'. 160 chars max." },
        column: COLUMN,
      },
      required: ["fraction"],
    },
  },
  {
    name: "add_number_line",
    description:
      "Draw a number line with labelled ticks. Marks put dots on values, intervals shade ranges (inequalities), jumps draw hop arrows (adding, subtracting, skip counting). Fractional steps label ticks as fractions. Use for integers, negatives, fractions, decimals, inequalities, absolute value, rounding, and counting on.",
    parameters: {
      type: "object",
      properties: {
        min: { type: "number", description: "Left end of the line." },
        max: { type: "number", description: "Right end of the line." },
        step: { type: "number", description: "Optional tick spacing, e.g. 1, 0.5, 0.25 (labelled 1/4, 1/2, 3/4). Chosen automatically when omitted." },
        points: {
          type: "string",
          description: "Optional comma-separated dots: 'value' or 'value:label', fractions allowed. E.g. '3, 3/4:three quarters, -2:start'. 800 chars max.",
        },
        intervals: {
          type: "string",
          description: "Optional semicolon-separated shaded ranges. '2..5' closed, '(2..5)' open ends, '[0..1)' mixed, '2..inf' or '-inf..3' for rays. Add ':label'. E.g. '2..inf:x > 2'. 400 chars max.",
        },
        jumps: {
          type: "string",
          description: "Optional semicolon-separated hop arrows drawn above the line: 'from>to:label'. E.g. '0>3:+3; 3>5:+2'. 400 chars max.",
        },
        label: { type: "string", description: "Optional caption under the line. 160 chars max." },
        column: COLUMN,
      },
      required: ["min", "max"],
    },
  },
  {
    name: "draw_figure",
    description:
      "Draw a clean geometry figure with labels: triangle, right triangle, square, rectangle, or circle. Labels go on sides, vertices, angles, radius, or diameter. Use for area, perimeter, Pythagoras, angles in a triangle, similar shapes, circles, and any 'picture the shape' moment.",
    parameters: {
      type: "object",
      properties: {
        figure: { type: "string", enum: ["triangle", "right_triangle", "square", "rectangle", "circle"], description: "Which figure. right_triangle puts the right angle at the bottom left." },
        side_labels: {
          type: "string",
          description: "Optional pipe-separated side labels starting from the bottom side and going counter-clockwise: triangle 'base | right side | left side', rectangle 'width | height'. Use '?' for an unknown. E.g. '3 | 4 | ?'. 200 chars max.",
        },
        vertex_labels: { type: "string", description: "Optional pipe-separated vertex names starting bottom-left, counter-clockwise, e.g. 'A | B | C'. 80 chars max." },
        angle_labels: { type: "string", description: "Optional pipe-separated angle labels at the same vertices, e.g. '90° | 37° | ?'. 120 chars max." },
        mark_right_angle: { type: "boolean", description: "Draw the small square at the right angle (right_triangle, square, rectangle). Default true for right_triangle." },
        radius_label: { type: "string", description: "Circle only: draws the radius and labels it, e.g. 'r = 5 cm'. 80 chars max." },
        diameter_label: { type: "string", description: "Circle only: draws the diameter and labels it, e.g. 'd = 10'. 80 chars max." },
        label: { type: "string", description: "Optional caption under the figure. 160 chars max." },
        column: COLUMN,
      },
      required: ["figure"],
    },
  },
  {
    name: "draw_angle",
    description:
      "Draw an angle: two rays from a vertex with the arc and its measure. Use for acute/obtuse/right, complementary and supplementary angles, and estimating angle size.",
    parameters: {
      type: "object",
      properties: {
        degrees: { type: "number", description: "Angle in degrees, 1 to 359." },
        label: { type: "string", description: "Optional label on the arc, e.g. '37°', 'x', 'θ'. Defaults to the degree measure. 40 chars max." },
        caption: { type: "string", description: "Optional caption under the drawing. 160 chars max." },
        column: COLUMN,
      },
      required: ["degrees"],
    },
  },
  {
    name: "draw_array",
    description:
      "Draw a rows × columns array of dots, optionally split into groups with a dashed line. Use for multiplication as repeated groups, the distributive property (3 × 7 = 3 × 5 + 3 × 2), factors, and area as counting squares.",
    parameters: {
      type: "object",
      properties: {
        rows: { type: "number", description: "Number of rows, 1 to 12." },
        columns: { type: "number", description: "Number of columns, 1 to 12." },
        split_after_column: { type: "number", description: "Optional: draw a dashed divider after this column to show two groups." },
        split_after_row: { type: "number", description: "Optional: dashed divider after this row." },
        label: { type: "string", description: "Optional caption, e.g. '3 × 7'. 160 chars max." },
        column: COLUMN,
      },
      required: ["rows", "columns"],
    },
  },
  {
    name: "add_area_model",
    description:
      "Draw an area model (box method) grid with row and column headers and a value in each cell. Use for multi-digit multiplication, expanding (x + 2)(x + 3), and factoring quadratics.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Caption above the grid, e.g. '(x + 2)(x + 3)'. 160 chars max." },
        row_labels: { type: "string", description: "Pipe-separated row headers, e.g. 'x | 3'. 200 chars max." },
        column_labels: { type: "string", description: "Pipe-separated column headers, e.g. 'x | 2'. 200 chars max." },
        cells: {
          type: "string",
          description: "Cell values, rows separated by ';' or newlines, cells by '|'. Leave a cell empty for the student to fill: 'x^2 | 2x; 3x | '. 800 chars max.",
        },
        column: COLUMN,
      },
      required: ["title", "row_labels", "column_labels", "cells"],
    },
  },
  {
    name: "draw_balance",
    description:
      "Draw an equation as a balance scale with tiles on each pan. The picture for 'do the same thing to both sides'. Use when introducing solving equations or when a student subtracts from only one side.",
    parameters: {
      type: "object",
      properties: {
        left: { type: "string", description: "Pipe-separated tiles on the left pan, e.g. 'x | x | 3'. Up to 8 tiles. 200 chars max." },
        right: { type: "string", description: "Pipe-separated tiles on the right pan, e.g. '11'. Up to 8 tiles. 200 chars max." },
        tilt: { type: "string", enum: ["level", "left", "right"], description: "'level' (default) when both sides are equal; 'left' or 'right' to show the heavier side dipping." },
        label: { type: "string", description: "Optional caption, e.g. '2x + 3 = 11'. 160 chars max." },
        column: COLUMN,
      },
      required: ["left", "right"],
    },
  },
  {
    name: "draw_bar_chart",
    description:
      "Draw a simple bar chart from categories and values. Use for data questions, comparing quantities, mean and median intuition, and reading graphs.",
    parameters: {
      type: "object",
      properties: {
        categories: { type: "string", description: "Pipe-separated category names, up to 8, e.g. 'Mon | Tue | Wed'. 200 chars max." },
        values: { type: "string", description: "Pipe-separated numbers, one per category, e.g. '3 | 5 | 2'. 200 chars max." },
        unit: { type: "string", description: "Optional unit for the value axis, e.g. 'hours'. 40 chars max." },
        label: { type: "string", description: "Optional caption above the chart. 160 chars max." },
        column: COLUMN,
      },
      required: ["categories", "values"],
    },
  },

  // ── Tables and graphs ────────────────────────────────────────────────────
  {
    name: "add_table",
    description:
      "A table for comparing values or laying out cases: function value tables, unit conversions, before/after, kinetic vs potential energy.",
    parameters: {
      type: "object",
      properties: {
        columns: { type: "string", description: "Pipe-separated headers, e.g. 'x | y | y = x²'. 320 chars max." },
        rows: { type: "string", description: "Rows separated by newlines or ';', cells by '|'. E.g. '-2 | -1 | 4; -1 | 0 | 1'. 1600 chars max." },
        title: { type: "string", description: "Optional caption. 160 chars max." },
        column: COLUMN,
      },
      required: ["columns", "rows"],
    },
  },
  {
    name: "add_coordinate_axes",
    description:
      "An empty xy grid. Use before plot_points or when talking about coordinates without a specific function. For y = f(x) prefer add_function_graph.",
    parameters: {
      type: "object",
      properties: {
        x_min: { type: "number", description: "Minimum x." },
        x_max: { type: "number", description: "Maximum x." },
        y_min: { type: "number", description: "Minimum y." },
        y_max: { type: "number", description: "Maximum y." },
        label: { type: "string", description: "Optional caption. 160 chars max." },
        column: COLUMN,
      },
      required: ["x_min", "x_max", "y_min", "y_max"],
    },
  },
  {
    name: "plot_points",
    description: "Plot labelled points on an xy grid: scatter data, a vertex, intercepts, or the corners of a shape.",
    parameters: {
      type: "object",
      properties: {
        points: { type: "string", description: "Comma-separated '(x,y)' or '(x,y):label', e.g. '(0,0), (1,1):A, (2,4):B'. 800 chars max." },
        x_min: { type: "number", description: "Minimum x of the grid." },
        x_max: { type: "number", description: "Maximum x of the grid." },
        y_min: { type: "number", description: "Minimum y of the grid." },
        y_max: { type: "number", description: "Maximum y of the grid." },
        label: { type: "string", description: "Optional caption. 160 chars max." },
        column: COLUMN,
      },
      required: ["points", "x_min", "x_max", "y_min", "y_max"],
    },
  },
  {
    name: "add_function_graph",
    description: "Plot a continuous y = f(x) curve on a grid: lines, parabolas, trig, exponentials, absolute value.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Expression in x, e.g. 'x^2 - 4*x - 5', 'sin(x)', '2*x + 3', 'abs(x - 2)'. Operators + - * / ^, sqrt(), sin(), cos(), tan(), abs(), log(). 200 chars max.",
        },
        x_min: { type: "number", description: "Minimum x." },
        x_max: { type: "number", description: "Maximum x." },
        label: { type: "string", description: "Optional caption, e.g. 'y = x² - 4x - 5'. 160 chars max." },
        column: COLUMN,
      },
      required: ["expression", "x_min", "x_max"],
    },
  },

  // ── Notes ─────────────────────────────────────────────────────────────────
  {
    name: "add_text_note",
    description:
      "Handwritten words on the board: a definition, a rule in words, a one-line takeaway, a label. Keep it to a line or two. Never use text to describe a picture or to fake a diagram with brackets and dashes; use a picture tool instead.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The words, 1200 chars max." },
        size: { type: "string", enum: ["heading", "body"], description: "'heading' for a bold title, 'body' (default) for a note." },
        column: COLUMN,
      },
      required: ["text"],
    },
  },
  {
    name: "add_callout",
    description:
      "A coloured sticky note: hint (yellow), correct (green), wrong (red), warning (orange), important (violet), remember (light blue). Short and glanceable.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Sticky-note text, 400 chars max." },
        style: { type: "string", enum: ["hint", "correct", "wrong", "warning", "important", "remember"], description: "Semantic style; the colour follows." },
        column: COLUMN,
      },
      required: ["text", "style"],
    },
  },
  {
    name: "add_worked_example_box",
    description: "A boxed 'key idea' or worked example with a title and a short body. Use to crystallise a takeaway, or to show a model problem before the student tries a similar one.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title, 160 chars max." },
        body: { type: "string", description: "The example or key idea, 1600 chars max." },
        column: COLUMN,
      },
      required: ["title", "body"],
    },
  },
  {
    name: "add_two_column_comparison",
    description: "Two boxes side by side, left in red and right in green: wrong vs right, before vs after, method A vs method B.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Heading above both columns, 160 chars max." },
        left_title: { type: "string", description: "Left header, e.g. 'Incorrect'. 80 chars max." },
        left_body: { type: "string", description: "Left content, newlines allowed. 800 chars max." },
        right_title: { type: "string", description: "Right header, e.g. 'Correct'. 80 chars max." },
        right_body: { type: "string", description: "Right content. 800 chars max." },
        column: COLUMN,
      },
      required: ["title", "left_title", "left_body", "right_title", "right_body"],
    },
  },
  {
    name: "add_vector_diagram",
    description: "A free-body style diagram: a labelled centre object with labelled arrows in named directions. Forces, velocities, fields.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Caption, e.g. 'Forces on the block'. 160 chars max." },
        center_label: { type: "string", description: "Centre object label, e.g. 'block'. 80 chars max." },
        vectors: {
          type: "string",
          description: "Semicolon-separated 'direction:label'. Directions: up, down, left, right, up-left, up-right, down-left, down-right. E.g. 'up:Normal N; down:Weight mg; right:Push F; left:Friction f'. 800 chars max.",
        },
        column: COLUMN,
      },
      required: ["title", "center_label", "vectors"],
    },
  },
  {
    name: "add_process_map",
    description: "Labelled boxes joined by arrows: steps of a method, a cause-and-effect chain, a reaction, an algorithm.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Caption. 160 chars max." },
        nodes: { type: "string", description: "Pipe-separated box labels in order, 8 max. 800 chars max." },
        connectors: { type: "string", description: "Optional pipe-separated arrow labels, one fewer than nodes. 400 chars max." },
        column: COLUMN,
      },
      required: ["title", "nodes"],
    },
  },
  {
    name: "draw_sketch",
    description:
      "Freehand sketch for anything the other picture tools do not cover: a ramp with a box, a cell, a water cycle, a simple map. Strokes are polylines in a 0-100 box (x right, y down). Keep it to a few strokes and label the parts. Prefer draw_fraction, draw_figure, add_number_line and the other picture tools when they fit.",
    parameters: {
      type: "object",
      properties: {
        strokes: {
          type: "string",
          description: "Semicolon-separated strokes, each 'x,y x,y x,y ...' in 0-100. Prefix a stroke with 'closed' to fill it: 'closed 10,90 90,90 90,40; 40,40 40,10'. Up to 24 strokes. 2000 chars max.",
        },
        labels: { type: "string", description: "Optional semicolon-separated 'x,y:text' labels, e.g. '50,95:ground; 20,30:ramp'. 400 chars max." },
        width: { type: "number", description: "Optional width in board units, 160-560. Default 320." },
        height: { type: "number", description: "Optional height, 120-420. Default 220." },
        label: { type: "string", description: "Optional caption under the sketch. 160 chars max." },
        column: COLUMN,
      },
      required: ["strokes"],
    },
  },
  {
    name: "clear_whiteboard",
    description: "Erase everything with no heading. Almost always prefer start_new_problem, which clears and titles in one call.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "remember_about_student",
    description:
      "Record a durable fact about THIS student for future sessions: a misconception, what finally clicked, a topic they have mastered, a preference. One short sentence, only when it will matter next week. Draws nothing.",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "One short fact, e.g. 'confuses kinetic with momentum' or 'got fractions after the pizza picture'." },
      },
      required: ["note"],
    },
  },
];

// ── OpenAI Responses function-tool format ──────────────────────────────────
// The declarations above are the single source of truth. GPT-Live's Responses
// backend takes the same JSON-schema `parameters`, wrapped as a function tool.
export type OpenAIFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: false;
};

export const WHITEBOARD_FUNCTION_TOOLS: OpenAIFunctionTool[] = WHITEBOARD_TOOL_DECLARATIONS.map(
  (decl) => ({
    type: "function",
    name: decl.name,
    description: decl.description,
    parameters: decl.parameters as Record<string, unknown>,
    strict: false,
  }),
);
