import { DESMOS_ONLY_TOOLS, desmosConfigured } from "./desmos-config";


export type WhiteboardToolName =
  | "start_new_problem"
  | "start_board_section"
  | "add_problem_setup"
  | "add_equation_sequence"
  | "draw_equation_step"
  | "add_text_note"
  | "add_callout"
  | "add_student_attempt"
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
  | "plot_points"
  | "add_worked_example_box"
  | "add_function_graph"
  | "draw_desmos"
  | "draw_data_plot"
  | "draw_sketch"
  | "draw_tape_diagram"
  | "draw_grid"
  | "write_vertical"
  | "draw_long_division"
  | "draw_transversal"
  | "draw_icons"
  | "point_at"
  | "circle_item"
  | "erase_items"
  | "erase_older"
  | "highlight"
  | "look_at_board";

const PLACE = {
  type: "string",
  description: "Optional: 'beside b3', 'below b3', or a free area named in [Board: …] ('the right third', 'bottom left'). Usually leave it out: work flows on through the current section.",
} as const;

const ALL_TOOL_DECLARATIONS = [
  // ── Structure ─────────────────────────────────────────────────────────────
  {
    name: "start_new_problem",
    description:
      "Clear the board and write a heading. Use it every time the problem or topic changes.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short heading, 160 chars or fewer, e.g. 'Solving 2x + 3 = 11', 'One half', 'Area of a triangle'.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "start_board_section",
    description:
      "Open the next panel of the board under a subheading, without clearing: beside the work while there is width, else under it. Use when the same problem moves to a new phase ('Check the answer', 'Your turn'). Never clear to make room.",
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
      "A boxed 'Goal / Givens / Unknown / Plan' block. Use at the start of word problems and multi-step algebra so the setup is explicit before any computation.",
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
        place: PLACE,
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
        place: PLACE,
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
        place: PLACE,
      },
      required: ["steps"],
    },
  },
  {
    name: "add_student_attempt",
    description:
      "Write the student's answer in their hand, marked as theirs: their exact words when they answer, right or wrong. Not \"I don't know\", a question, or a description of them (those are refused). Then circle_item with keep=true if it is right, or cross_out_step and the corrected line if it is wrong.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Their exact words, e.g. 'x = 16'. 200 chars max." },
        place: PLACE,
      },
      required: ["text"],
    },
  },
  {
    name: "cross_out_step",
    description:
      "Strike through an equation line that is already on the board: a wrong attempt, or a path that does not work. Usually paired with add_student_attempt before and the corrected line after.",
    parameters: {
      type: "object",
      properties: {
        step_label: { type: "string", description: "PREFERRED. A unique fragment of the line (or of the student's attempt). 200 chars max." },
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
        common_denominator: { type: "number", description: "Optional: cut every model into this many equal pieces instead, so 1/2 and 1/3 with common_denominator 6 are drawn as 3/6 and 2/6. THE picture for adding, subtracting, or comparing fractions with unlike denominators. Must be a multiple of each denominator, 24 or less." },
        label: { type: "string", description: "Optional caption under the picture, e.g. 'one half of the pizza'. 160 chars max." },
        place: PLACE,
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
        step: { type: "number", description: "Optional tick spacing, e.g. 1, 0.5, 0.25 (labelled 1/4, 1/2, 3/4), 0.1 (labelled 0.1, 0.2). Chosen automatically when omitted." },
        label_style: { type: "string", enum: ["fraction", "decimal"], description: "How to label ticks between whole numbers. Default: halves, thirds, quarters as fractions; tenths and hundredths as decimals." },
        second_min: { type: "number", description: "Optional: with second_max, draws a second scale under the first at the same tick positions (a double number line). E.g. min 0, max 100 (percent) over second_min 0, second_max 80 (the amount). THE picture for percent of an amount and for ratios as rates." },
        second_max: { type: "number", description: "Right end of the second scale." },
        second_label: { type: "string", description: "Optional short label after the second line, e.g. 'marbles'. 40 chars max." },
        points: {
          type: "string",
          description: "Optional comma-separated dots: 'value' or 'value:label', fractions allowed. E.g. '3, 3/4:three quarters, -2:start'. Repeat a value to stack dots (a dot plot: '2, 2, 2, 3, 5, 5'). 800 chars max.",
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
        place: PLACE,
      },
      required: ["min", "max"],
    },
  },
  {
    name: "draw_figure",
    description:
      "Draw a clean geometry figure with labels: triangle, right triangle, square, rectangle, circle, parallelogram, trapezoid, rhombus, pentagon, hexagon, or a 3D rectangular prism, cube, or cylinder. Labels go on sides, vertices, angles, radius, diameter, or the height. Use for area, perimeter, Pythagoras, angles in a polygon, similar shapes, circles, volume and surface area, and any 'picture the shape' moment.",
    parameters: {
      type: "object",
      properties: {
        figure: {
          type: "string",
          enum: ["triangle", "right_triangle", "square", "rectangle", "circle", "parallelogram", "trapezoid", "rhombus", "pentagon", "hexagon", "rectangular_prism", "cube", "cylinder"],
          description: "Which figure. right_triangle puts the right angle at the bottom left. Solids (rectangular_prism, cube, cylinder) are drawn in 3D; their side_labels are 'length | width | height' (cylinder: 'radius | height').",
        },
        side_labels: {
          type: "string",
          description: "Optional pipe-separated side labels. right_triangle: 'bottom leg | upright leg | hypotenuse', e.g. '6 | 8 | x'. Other figures start at the bottom side and go counter-clockwise: triangle 'base | right side | left side', rectangle 'width | height'. '?' for an unknown. 200 chars max.",
        },
        vertex_labels: { type: "string", description: "Optional pipe-separated vertex names starting bottom-left, counter-clockwise, e.g. 'A | B | C'. 80 chars max." },
        angle_labels: { type: "string", description: "Optional pipe-separated angle labels at the same vertices, e.g. '90° | 37° | ?'. 120 chars max." },
        mark_right_angle: { type: "boolean", description: "Draw the small square at the right angle (right_triangle, square, rectangle). Default true for right_triangle." },
        radius_label: { type: "string", description: "Circle only: draws the radius and labels it, e.g. 'r = 5 cm'. 80 chars max." },
        diameter_label: { type: "string", description: "Circle only: draws the diameter and labels it, e.g. 'd = 10'. 80 chars max." },
        height_label: { type: "string", description: "Triangle, parallelogram, trapezoid: draws the dashed height (altitude) from the top down to the base with a right-angle mark and this label, e.g. 'h = 5'. THE way to show area = base × height. 80 chars max." },
        grid: { type: "boolean", description: "Optional: on a unit grid, to scale, for area by counting squares." },
        label: { type: "string", description: "Optional caption under the figure. 160 chars max." },
        place: PLACE,
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
        adjacent_degrees: { type: "number", description: "Optional second angle drawn next to the first, sharing a ray. 110 with adjacent 70 shows angles on a straight line (they add to 180); 90 with adjacent 90 shows a straight angle split in two; use for supplementary, complementary, and angles around a point." },
        adjacent_label: { type: "string", description: "Optional label for the second angle, e.g. '?' or 'x'. 40 chars max." },
        label: { type: "string", description: "Optional label on the arc, e.g. '37°', 'x', 'θ'. Defaults to the degree measure. 40 chars max." },
        caption: { type: "string", description: "Optional caption under the drawing. 160 chars max." },
        place: PLACE,
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
        shaded: { type: "number", description: "Optional: fill only the first N dots (reading order) and leave the rest hollow. For a fraction of a set: 12 dots with 3 shaded is one quarter." },
        label: { type: "string", description: "Optional caption, e.g. '3 × 7'. 160 chars max." },
        place: PLACE,
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
        place: PLACE,
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
        place: PLACE,
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
        place: PLACE,
      },
      required: ["categories", "values"],
    },
  },

  // ── Tables and graphs ────────────────────────────────────────────────────
  {
    name: "add_table",
    description:
      "A table for comparing values or laying out cases: input/output tables, unit conversions, before/after, ratio tables, place value.",
    parameters: {
      type: "object",
      properties: {
        columns: { type: "string", description: "Pipe-separated headers, e.g. 'x | y | y = x²'. 320 chars max." },
        rows: { type: "string", description: "Rows separated by newlines or ';', cells by '|'. E.g. '-2 | -1 | 4; -1 | 0 | 1'. 1600 chars max." },
        title: { type: "string", description: "Optional caption. 160 chars max." },
        place: PLACE,
      },
      required: ["columns", "rows"],
    },
  },
  {
    name: "plot_points",
    description: "Plot labelled points on an xy grid: scatter data, a vertex, intercepts, or the corners of a shape. With connect=true the points are joined in order into a polygon (shapes on a grid, transformations: call it twice for the original and the image).",
    parameters: {
      type: "object",
      properties: {
        points: { type: "string", description: "Comma-separated '(x,y)' or '(x,y):label', e.g. '(0,0), (1,1):A, (2,4):B'. 800 chars max." },
        x_min: { type: "number", description: "Minimum x of the grid." },
        x_max: { type: "number", description: "Maximum x of the grid." },
        y_min: { type: "number", description: "Minimum y of the grid." },
        y_max: { type: "number", description: "Maximum y of the grid." },
        label: { type: "string", description: "Optional caption. 160 chars max." },
        connect: { type: "boolean", description: "Join the points in order and close the shape. Default false." },
        place: PLACE,
      },
      required: ["points", "x_min", "x_max", "y_min", "y_max"],
    },
  },
  {
    name: "add_function_graph",
    description: "A real graph (drawn by Desmos) of y = f(x): lines, parabolas, trig, exponentials, absolute value, rational functions with their asymptotes. Can mark points, draw a slope (rise/run) triangle, add a second curve with the crossing marked, and add more lines on the same axes: shaded inequalities, circles, vertical lines, restricted pieces.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The function of x, in LaTeX or plain math: 'x^2-4x-5', '\\frac{1}{x}', '\\sqrt{x}', '\\left|x-2\\right|', '\\sin(x)', 'e^{-x}'. 'y =' is optional. 200 chars max.",
        },
        x_min: { type: "number", description: "Minimum x." },
        x_max: { type: "number", description: "Maximum x." },
        mark_points: { type: "string", description: "Optional points to mark on the graph: '(1,2):A, (3,6)'. Use for intercepts, a vertex, or the two points of a slope. 300 chars max." },
        slope_run: { type: "string", description: "Optional 'x1..x2': draws the rise/run triangle between those two x-values on the curve, labelled with the rise and the run. THE picture for slope. E.g. '1..3'." },
        second_expression: { type: "string", description: "Optional second curve on the same axes, in a second colour; where the two cross is marked with its coordinates. THE picture for a system of two equations. 200 chars max." },
        y_min: { type: "number", description: "Optional lowest y shown. Leave out and the graph picks a range that shows the curve." },
        y_max: { type: "number", description: "Optional highest y shown." },
        extra_expressions: { type: "string", description: "Optional more lines on the same axes, separated by ';': a shaded inequality 'y>2x-1', a circle 'x^2+y^2=9', a vertical line 'x=3', a restricted piece 'y=2x+1\\left\\{0<x<3\\right\\}'. Up to 6." },
        label: { type: "string", description: "Optional caption, e.g. 'y = x² - 4x - 5'. 160 chars max." },
        place: PLACE,
      },
      required: ["expression", "x_min", "x_max"],
    },
  },

  {
    name: "draw_desmos",
    description:
      "A Desmos graph of anything on a coordinate plane: lines and curves, shaded inequalities, systems, circles, parametric curves, point lists and polygons (shapes, transformations), a table with a best-fit regression, and sliders the student can drag in Explore. A letter with no value becomes a slider. Prefer it for anything on axes.",
    parameters: {
      type: "object",
      properties: {
        expressions: {
          type: "string",
          description: "Up to 8, separated by ';', in LaTeX or plain math: 'y=mx+b', 'y>2x-1', 'x^2+y^2=9', 'polygon((0,0),(4,0),(4,3))', '[(1,2),(3,4)]', '(\\cos t,\\sin t)', 'y~mx+b' (fits the table).",
        },
        points: { type: "string", description: "Optional labelled points: '(1,2):A, (3,4)'. 400 chars max." },
        table: { type: "string", description: "Optional two columns, header row first: 'hours | dollars; 1 | 12; 2 | 19'." },
        sliders: { type: "string", description: "Optional, separated by ';': 'm=2:-5..5; b=1' (value, then range)." },
        x_min: { type: "number", description: "Optional view; left out, it fits what is drawn." },
        x_max: { type: "number" },
        y_min: { type: "number" },
        y_max: { type: "number" },
        settings: { type: "string", description: "Optional, separated by '|': 'no grid', 'square', 'x step=2', 'x label=time (s)', 'y label=cost', 'arrows', 'degrees', 'log y'." },
        label: { type: "string", description: "Optional caption. 160 chars max." },
        place: PLACE,
      },
      required: [],
    },
  },
  {
    name: "draw_data_plot",
    description:
      "A data display from numbers: a dot plot, a histogram, a box plot (its five numbers written), or a scatter plot with a line or exponential curve of best fit. The result gives the mean and median, the quartiles, or the fit's equation and r.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["dot_plot", "histogram", "box_plot", "scatter"], description: "Which display." },
        values: { type: "string", description: "The data for a dot plot, histogram or box plot: '3 | 5 | 5 | 8'. 600 chars max." },
        points: { type: "string", description: "Scatter only: '(1,2.1), (2,3.9)'. 800 chars max." },
        fit: { type: "string", enum: ["none", "linear", "exponential"], description: "Scatter only. Default none." },
        bin_width: { type: "number", description: "Histogram only; chosen when left out." },
        x_label: { type: "string", description: "Optional word for the numbers, e.g. 'hours'. 40 chars max." },
        y_label: { type: "string", description: "Optional, scatter and histogram. 40 chars max." },
        label: { type: "string", description: "Optional caption. 160 chars max." },
        place: PLACE,
      },
      required: ["kind"],
    },
  },

  // ── Notes ─────────────────────────────────────────────────────────────────
  {
    name: "add_text_note",
    description:
      "One short line on the board: a rule, a label, a definition in a few words. 160 characters, hard limit, and longer calls are refused. An explanation belongs in speech, not on the board. Never use text to describe a picture or to fake a diagram; draw it.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The words. 160 chars max: one line, not a paragraph." },
        size: { type: "string", enum: ["heading", "body"], description: "'heading' for a bold title, 'body' (default) for a note." },
        place: PLACE,
      },
      required: ["text"],
    },
  },
  {
    name: "add_callout",
    description:
      "A small sky tag with one line for the student to keep looking at: a question to think about ('Which side is heavier?'), a rule, or a reminder. Praise and chat are said out loud, not written, and are refused.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "One short line, 120 chars max." },
        place: PLACE,
      },
      required: ["text"],
    },
  },
  {
    name: "add_worked_example_box",
    description: "A boxed key idea or worked example: a title and up to 3 short lines. For a rule worth keeping or a model problem, never for a paragraph of explanation. Say the explanation out loud instead.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title, 160 chars max." },
        body: { type: "string", description: "Up to 3 short lines, 140 chars max. Longer calls are refused: shorten it, or draw the idea instead." },
        place: PLACE,
      },
      required: ["title", "body"],
    },
  },
  // ── Math pictures (Sept 14 2026) ───────────────────────────────────────────
  {
    name: "draw_tape_diagram",
    description:
      "Draw a tape diagram (bar model): one or more rows of equal boxes. THE picture for ratios ('2 red for every 3 blue'), parts of a whole, word problems about totals and differences, and a fraction of a quantity (a quarter of 12). Mark boxes with * to shade them; end a row with '= total' to write its total.",
    parameters: {
      type: "object",
      properties: {
        rows: {
          type: "string",
          description: "Semicolon-separated rows. Each row: optional 'Name:' then pipe-separated box labels, '*' before a label shades it, optional '= total' at the end. E.g. 'Red: *4 | *4 = 8; Blue: 4 | 4 | 4 = 12' or '3 | 3 | 3 | 3 = 12'. Up to 4 rows, 12 boxes each. 400 chars max.",
        },
        total_label: { type: "string", description: "Optional label on a bracket spanning all rows, e.g. '20 marbles'. 80 chars max." },
        label: { type: "string", description: "Optional caption, e.g. '2 : 3'. 160 chars max." },
        place: PLACE,
      },
      required: ["rows"],
    },
  },
  {
    name: "draw_grid",
    description:
      "Draw a grid of squares with the first N shaded. THE picture for percent and decimals (a 10 × 10 grid with 25 shaded is 25% = 0.25), for a fraction of a set, for area as counting squares (a 3 × 4 rectangle has 12 squares), and, with shade_rows and shade_columns, for multiplying fractions (the overlap).",
    parameters: {
      type: "object",
      properties: {
        rows: { type: "number", description: "Rows, 1 to 20." },
        columns: { type: "number", description: "Columns, 1 to 20." },
        shaded: { type: "number", description: "How many squares to shade, filling row by row from the top left. Default 0." },
        shade_rows: { type: "number", description: "Optional: tint the first N rows (with shade_columns, the overlap is a fraction of a fraction: 2/3 × 3/4 is a 3 × 4 grid with shade_rows 2 and shade_columns 3, overlap 6 of 12)." },
        shade_columns: { type: "number", description: "Optional: hatch the first M columns. THE picture for multiplying fractions when used with shade_rows." },
        label: { type: "string", description: "Optional caption, e.g. '25 out of 100 = 25%'. 160 chars max." },
        place: PLACE,
      },
      required: ["rows", "columns"],
    },
  },
  {
    name: "write_vertical",
    description:
      "Write an addition, subtraction, or multiplication the way it is done on paper: numbers stacked and right-aligned, the operator on the left, a line, then the answer. Use for multi-digit arithmetic, carrying and borrowing, and long multiplication (give the partial products). Leave result blank while the student works it out.",
    parameters: {
      type: "object",
      properties: {
        operands: { type: "string", description: "Pipe-separated numbers top to bottom, e.g. '347 | 289'. Decimals allowed. 2 to 4 numbers." },
        operation: { type: "string", enum: ["+", "-", "×"], description: "The operation." },
        result: { type: "string", description: "Optional answer line under the rule. Omit while the student is still working." },
        carries: { type: "string", description: "Optional small carry digits written above the top number, right-aligned; use spaces to place them, e.g. '1 1'." },
        partial_products: { type: "string", description: "Multiplication only: optional pipe-separated partial products between the rule and the answer, e.g. '92 | 230'." },
        label: { type: "string", description: "Optional caption. 160 chars max." },
        place: PLACE,
      },
      required: ["operands", "operation"],
    },
  },
  {
    name: "draw_long_division",
    description:
      "Set up long division with the bracket: divisor outside, dividend inside, quotient on top. Give steps as they appear line by line under the dividend (use leading spaces to line digits up; start a line with '-' for the subtraction, which gets a rule under it). Add steps one at a time as the student works.",
    parameters: {
      type: "object",
      properties: {
        dividend: { type: "string", description: "The number being divided, e.g. '156'." },
        divisor: { type: "string", description: "The number dividing, e.g. '12'." },
        quotient: { type: "string", description: "Optional digits on top so far, right-aligned over the dividend, e.g. '13' or '1 '. Use spaces to place partial quotients." },
        steps: { type: "string", description: "Optional pipe-separated lines under the dividend, e.g. '-12 | 36 | -36 | 0'. Leading spaces line digits up. 8 lines max." },
        label: { type: "string", description: "Optional caption. 160 chars max." },
        place: PLACE,
      },
      required: ["dividend", "divisor"],
    },
  },
  {
    name: "draw_transversal",
    description:
      "Two parallel lines cut by a transversal, with the eight angles labelled. THE picture for corresponding, alternate interior, alternate exterior, and co-interior angles. Angles are numbered clockwise from the upper left: 1-4 at the top intersection, 5-8 at the bottom.",
    parameters: {
      type: "object",
      properties: {
        angle_labels: { type: "string", description: "Pipe-separated labels for angles 1 to 8, e.g. '1 | 2 | 3 | 4 | 5 | 6 | 7 | 8' or '110° | ? | | | | 70°'. Leave blank to skip an angle. 200 chars max." },
        mark_angles: { type: "string", description: "Optional angle numbers to mark with a coloured arc, e.g. '1 | 5' for a pair of corresponding angles." },
        label: { type: "string", description: "Optional caption, e.g. 'corresponding angles are equal'. 160 chars max." },
        place: PLACE,
      },
      required: ["angle_labels"],
    },
  },
  {
    name: "draw_icons",
    description:
      "Draw rows of real things: apples, coins, pizzas, cars, cats, cookies, balloons and so on. THE picture for counting, equal groups, sharing, multiplication as groups, taking away (crossed), comparing two amounts (second_icon), and for an everyday analogy when the abstract version is not landing. Twelve cookies in groups of three is a picture of 12 ÷ 3.",
    parameters: {
      type: "object",
      properties: {
        icon: { type: "string", description: "Which thing, in plain words: apples, cookies, coins, cars, dogs, kids, stars, boxes. About 380 everyday things (food, animals, people, money, school, transport, buildings, sport, nature), plus coloured squares and circles, the digits 0-10 and clock faces. A name that does not exist is refused with near matches." },
        count: { type: "number", description: "How many, 1 to 120. Ask for the real number: 55 apples draws 55 apples." },
        group_size: { type: "number", description: "Optional: equal groups of N, 2 to 12. Whole groups never split across a row, so groups of 5 read as groups of 5." },
        crossed: { type: "number", description: "Optional: cross out the last N icons with a red X (eaten, spent, given away)." },
        second_icon: { type: "string", description: "Optional second row of a different thing, to compare or to show a ratio." },
        second_count: { type: "number", description: "How many in the second row, 1 to 120." },
        arrange: {
          type: "string",
          enum: ["rows", "array", "ten_frame", "ring", "groups"],
          description: "Layout. 'rows' (default) wraps. 'array' is rows by columns, the picture of multiplication: 55 in 5 columns is 11 rows of 5. 'ten_frame' is framed tens, 5 by 2. 'ring' is a circle, for a clock face or things round a table. 'groups' draws each group in its own box.",
        },
        columns: { type: "number", description: "For arrange='array': how many per row, 1 to 20." },
        label: { type: "string", description: "Optional caption, e.g. '12 cookies, 4 friends'. 160 chars max." },
        place: PLACE,
      },
      required: ["icon", "count"],
    },
  },
  {
    name: "draw_sketch",
    description:
      "The fallback picture, for any topic the other tools do not cover: a clock face, a garden plot with a path, a ladder against a wall, a shape made of two rectangles, a simple map. Reach for this rather than writing a paragraph: a topic with no picture tool of its own is still a topic to draw. Strokes are polylines in a 0-100 box (x right, y down). Keep it to a few strokes and label the parts. Use a dedicated tool (draw_fraction, draw_figure, add_number_line) when one fits.",
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
        place: PLACE,
      },
      required: ["strokes"],
    },
  },
  // ── Pointing, marking, erasing ─────────────────────────────────────────────
  {
    name: "point_at",
    description:
      "Move your pointer onto something on the board while you talk about it ('this piece', 'that line', 'here'). Free and quick: use it whenever you refer to something that is on the board, especially when asking a question about it.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "An item id from the [Board: …] list (e.g. 'b3'), or a few words from its label ('shaded pizza'), or 'last' for the newest item.",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "highlight",
    description:
      "Run your sky-blue highlighter over something on the board while you talk about it: one term in an equation, a number in a table, a label on a number line or figure, or a whole item. Use it whenever you say 'this', 'notice', or 'look at'. There is one colour, so say what the mark means ('this is the step we fix'). Highlights stay until erased.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "Item id ('b3'), label words, or 'last'." },
        text: { type: "string", description: "The exact part to highlight as it reads on the board, e.g. '2x', '3/4', '11'. Leave it out to highlight the whole item." },
      },
      required: ["target"],
    },
  },
  {
    name: "circle_item",
    description:
      "Draw a ring around something on the board to mark it: the part a question is about, the line that matters, the answer once they get it. By default a laser ring that fades after a few seconds; keep=true leaves a sky ring on the board.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "Item id ('b3'), label words, or 'last'." },
        keep: { type: "boolean", description: "true = a ring that stays (use it to mark a final answer). Default false (fades)." },
      },
      required: ["target"],
    },
  },
  {
    name: "erase_items",
    description:
      "Erase specific items from the board: a wrong attempt after it has been corrected, a picture the student no longer needs, a hint they have used. Keeps the rest.",
    parameters: {
      type: "object",
      properties: {
        targets: { type: "string", description: "Item ids or label words, separated by '|': 'b4|b5' or 'first pizza|hint'." },
      },
      required: ["targets"],
    },
  },
  {
    name: "erase_older",
    description:
      "Tidy the board: erase everything except the heading and the newest items. Use when more than about six items are up, or when the student has moved past the earlier work.",
    parameters: {
      type: "object",
      properties: {
        keep: { type: "number", description: "How many of the newest items to keep. Default 3." },
      },
      required: [],
    },
  },
  {
    name: "look_at_board",
    description:
      "Look at the board: returns the list of items and sends you a fresh picture of the whole board. Use it to check a drawing came out right, to read something the student drew or wrote on the board, or whenever you are unsure what is up there.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "remember_about_student",
    description:
      "Record a durable fact about THIS student for future sessions: a misconception, what finally clicked, a topic they have mastered, a preference. One short sentence, only when it will matter next week. Draws nothing.",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "One short fact, e.g. 'mixes up numerator and denominator' or 'got fractions after the pizza picture'." },
      },
      required: ["note"],
    },
  },
];

/** The tools this build offers: Desmos-only ones need Desmos (lib/desmos-config.ts). */
export const WHITEBOARD_TOOL_DECLARATIONS = ALL_TOOL_DECLARATIONS.filter((decl) => desmosConfigured() || !DESMOS_ONLY_TOOLS.has(decl.name));

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
