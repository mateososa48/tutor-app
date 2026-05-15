export type WhiteboardToolName =
  | "start_new_problem"
  | "draw_equation_step"
  | "add_text_note"
  | "add_function_graph"
  | "draw_shape"
  | "highlight_step"
  | "cross_out_step"
  | "clear_whiteboard";

export const WHITEBOARD_TOOL_DECLARATIONS = [
  {
    name: "start_new_problem",
    description:
      "Clears the whiteboard AND writes a bold heading at the top. Use this every time you start a new problem, example, or topic — it both erases the board and titles the new section in one call. Strongly preferred over calling clear_whiteboard manually.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Short title for the new problem or topic (e.g. 'Factoring x² + 5x + 6', 'Free-body diagram', 'Example 2: chain rule').",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "draw_equation_step",
    description:
      "Write a math equation step on the whiteboard. Whiteboard has TWO columns (left and right) — use them. Default is left. Use right column for parallel work, comparisons, alternate forms, or graphs alongside equations. Call this OFTEN — every meaningful math step deserves its own call. Break long algebra into many small steps.",
    parameters: {
      type: "object",
      properties: {
        latex: {
          type: "string",
          description:
            "The LaTeX expression (e.g. 'x^2 + 5x + 6 = 0'). No $$ delimiters.",
        },
        annotation: {
          type: "string",
          description:
            "Optional 2-6 word italic note shown next to the equation, like a pencil note (e.g. 'factor', 'subtract 2 from both sides', 'discriminant > 0').",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description:
            "Which column to place this in. Default 'left'. Use 'right' when comparing, showing alternate forms, working two cases in parallel, or pairing with a graph.",
        },
      },
      required: ["latex"],
    },
  },
  {
    name: "add_text_note",
    description:
      "Write plain text on the whiteboard. Use frequently to label sections, explain a concept in words, or write a takeaway. Pick size 'heading' for section titles, 'body' for everything else.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text to write.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Which column. Default 'left'.",
        },
        size: {
          type: "string",
          enum: ["heading", "body"],
          description:
            "'heading' = larger bold section title. 'body' = regular note. Default 'body'.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "add_function_graph",
    description:
      "Plot a mathematical function y = f(x) on the whiteboard. Use this whenever a function or curve helps the student see what's going on — visualizing parabolas, sine waves, derivatives, motion graphs, etc. Often goes in the RIGHT column next to the equation it represents.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "JavaScript math expression in terms of x (e.g. 'x*x + 5*x + 6', 'sin(x)', 'Math.exp(-x)'). Use *, /, +, -, **, Math.* functions.",
        },
        x_min: {
          type: "number",
          description: "Minimum x value for the plot domain.",
        },
        x_max: {
          type: "number",
          description: "Maximum x value for the plot domain.",
        },
        label: {
          type: "string",
          description: "Short label shown below the graph (e.g. 'y = x² + 5x + 6').",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Which column. Default 'right' for graphs (pairs with equation on left).",
        },
      },
      required: ["expression", "x_min", "x_max"],
    },
  },
  {
    name: "draw_shape",
    description:
      "Draw a geometric shape on the whiteboard using Excalidraw's hand-drawn style. Use this for diagrams, figures, physics sketches, geometry — any time you'd draw a shape on a real whiteboard. Shapes render with a natural hand-drawn look. Prefer this over trying to plot shapes with add_function_graph.",
    parameters: {
      type: "object",
      properties: {
        shape: {
          type: "string",
          enum: ["rectangle", "ellipse", "diamond", "triangle", "arrow"],
          description:
            "rectangle = box (good for labeled variables, surfaces, containers). ellipse = circle/oval. diamond = rhombus. triangle = triangle (pyramid cross-section, right triangle, etc). arrow = horizontal arrow (good for showing direction, flow, cause→effect).",
        },
        label: {
          type: "string",
          description:
            "Optional text label drawn inside or below the shape (e.g. 'Base B', 'h = height', 'v₀').",
        },
        width: {
          type: "number",
          description: "Shape width in pixels. Defaults: rectangle 160, ellipse 120, diamond 130, triangle 160, arrow 180.",
        },
        height: {
          type: "number",
          description: "Shape height in pixels. Defaults: rectangle 90, ellipse 90, diamond 80, triangle 110, arrow 0 (arrows are flat).",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Which column. Default 'left'.",
        },
      },
      required: ["shape"],
    },
  },
  {
    name: "highlight_step",
    description:
      "Mark an existing whiteboard item with a circle, underline, or box to draw attention to it. Use sparingly — only when it really matters.",
    parameters: {
      type: "object",
      properties: {
        step_index: {
          type: "number",
          description: "Zero-based index of the item to highlight (0 = first item drawn).",
        },
        style: {
          type: "string",
          enum: ["circle", "underline", "box"],
          description:
            "'circle' = hand-drawn ring. 'underline' = line beneath. 'box' = dashed rectangle around it.",
        },
      },
      required: ["step_index", "style"],
    },
  },
  {
    name: "cross_out_step",
    description:
      "Draw a strikethrough line through an existing item. Use when correcting a mistake, showing a wrong attempt, or marking something as no longer valid (e.g. 'this approach doesn't work — let's try another').",
    parameters: {
      type: "object",
      properties: {
        step_index: {
          type: "number",
          description: "Zero-based index of the item to cross out.",
        },
      },
      required: ["step_index"],
    },
  },
  {
    name: "clear_whiteboard",
    description:
      "Erase EVERYTHING on the whiteboard. Prefer start_new_problem instead, which clears + titles in one call.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];
