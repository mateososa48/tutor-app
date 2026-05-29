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
  | "add_table"
  | "add_number_line"
  | "add_coordinate_axes"
  | "plot_points"
  | "add_worked_example_box"
  | "add_function_graph"
  | "add_two_column_comparison"
  | "add_vector_diagram"
  | "add_process_map"
  | "clear_whiteboard";

export type CalloutStyle = "hint" | "correct" | "wrong" | "warning" | "important" | "remember";

export const WHITEBOARD_TOOL_DECLARATIONS = [
  // ── Direct templated tools (synchronous, no LLM round-trip) ───────────────
  {
    name: "start_new_problem",
    description:
      "Clears the whiteboard AND writes a bold heading at the top. Use this every time you start a new problem, example, or topic — it both erases the board and titles the new section in one call. Strongly preferred over calling clear_whiteboard manually. Renders synchronously; safe to follow immediately with more board calls.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Short title for the new problem or topic, 160 chars or fewer (e.g. 'Factoring x² + 5x + 6', 'Newton's second law', 'Example 2: chain rule').",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "start_board_section",
    description:
      "Write a section divider/subheading on the existing board WITHOUT clearing. Use this when continuing the same problem but moving to a new phase (e.g. 'Now solve for x', 'Check the answer', 'Try a similar problem'). If the board is getting full, set fresh_page=true to start a new page below.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short subheading text, 160 chars or fewer.",
        },
        fresh_page: {
          type: "boolean",
          description:
            "If true, advance to a fresh page below the current content before writing the heading. Use when the current page is full or when starting a logically separate phase.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "add_problem_setup",
    description:
      "Lay out a structured 'Goal / Givens / Unknowns / Plan' block at the top of a new problem. Use this near the start of any non-trivial problem to make the setup explicit before computation. Especially valuable for word problems, physics, and multi-step algebra.",
    parameters: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "One-line statement of what we're solving for, 320 chars or fewer.",
        },
        givens: {
          type: "string",
          description:
            "Optional pipe-separated list of given facts, e.g. 'v0 = 5 m/s | a = 9.8 m/s² | t = 2 s'. 800 chars max.",
        },
        unknowns: {
          type: "string",
          description: "Optional comma-separated unknowns, e.g. 'final position, time of flight'. 320 chars max.",
        },
        plan: {
          type: "string",
          description:
            "Optional one-line strategy, e.g. 'Use kinematic equation v = v0 + a t, then plug in.' 600 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Which column to place this in. Default 'left'.",
        },
      },
      required: ["goal"],
    },
  },
  {
    name: "add_equation_sequence",
    description:
      "Render a sequence of equation steps as a vertically stacked block — the workhorse for any multi-step derivation, algebra, or worked calculation. ALWAYS prefer this over multiple draw_equation_step calls when you have 2+ related steps. Renders synchronously, so the student sees the full derivation immediately. Pair with annotations to explain each step.",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "string",
          description:
            "Pipe-separated LaTeX steps WITHOUT $$ delimiters, e.g. 'x^2 + 5x + 6 = 0 | (x+2)(x+3) = 0 | x = -2 \\text{ or } x = -3'. Each step becomes one row. 1600 chars max.",
        },
        annotations: {
          type: "string",
          description:
            "Optional pipe-separated short italic notes paired one-to-one with steps, e.g. 'factor | zero-product property | solve each factor'. Use empty slots for unannotated steps: 'factor || solve'. 800 chars max.",
        },
        title: {
          type: "string",
          description: "Optional short title above the sequence, e.g. 'Solving the quadratic'. 160 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'. Use 'right' for parallel work or alternate forms.",
        },
      },
      required: ["steps"],
    },
  },
  {
    name: "draw_equation_step",
    description:
      "Write a SINGLE equation line on the board. Use ONLY when you genuinely want one step at a time (e.g. interactive 'what's the next step?'). For any pre-planned derivation with 2+ steps, use add_equation_sequence instead.",
    parameters: {
      type: "object",
      properties: {
        latex: {
          type: "string",
          description: "The LaTeX expression without $$ delimiters, e.g. 'x^2 + 5x + 6 = 0'. 600 chars max.",
        },
        annotation: {
          type: "string",
          description:
            "Optional 2-6 word italic pencil note shown beside the equation, e.g. 'factor', 'subtract 2 from both sides', 'discriminant > 0'. 160 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'. Use 'right' for parallel work, comparisons, or pairing with a graph.",
        },
      },
      required: ["latex"],
    },
  },
  {
    name: "add_text_note",
    description:
      "Write plain text on the board. Use frequently to label sections, capture a concept in words, or write a one-line takeaway after a derivation. Pick 'heading' for a section title or 'body' for everything else.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to write, 1200 chars max.",
        },
        size: {
          type: "string",
          enum: ["heading", "body"],
          description: "'heading' = larger bold title. 'body' = regular note. Default 'body'.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "add_callout",
    description:
      "Drop a colored sticky-note callout using a semantic style — the system picks the right color automatically. Use for: hints (yellow), correct answers (green), errors/misconceptions (red), warnings about common mistakes (orange), key concepts or definitions (violet), formulas to remember (light-blue). Text is rendered in handwriting font. The note grows with content.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The callout text. Keep it short and glanceable — 400 chars max. A sticky note, not a paragraph.",
        },
        style: {
          type: "string",
          enum: ["hint", "correct", "wrong", "warning", "important", "remember"],
          description:
            "'hint' = yellow nudge. 'correct' = green success. 'wrong' = red error. 'warning' = orange caution. 'important' = violet key concept. 'remember' = light-blue formula/rule.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'. Use 'right' to place next to equations.",
        },
      },
      required: ["text", "style"],
    },
  },
  {
    name: "add_student_attempt",
    description:
      "Capture what the student SAID or TRIED on the board, visually marked as the student's work (not the tutor's). Use this every time the student gives a substantive answer or attempt — right or wrong — so it becomes part of the visible reasoning. Pair with highlight_step (when right) or cross_out_step + draw_equation_step (when wrong) for feedback.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The student's attempt verbatim or paraphrased, 1200 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "highlight_step",
    description:
      "Mark an existing equation/step on the board with a circle, underline, or dashed box to draw attention to it. Use sparingly — only when emphasis genuinely helps (e.g. 'this is the key insight', 'notice this term cancels'). Prefer the step_label form: identify the step by a fragment of its LaTeX or its tutorReferenceLabel.",
    parameters: {
      type: "object",
      properties: {
        step_label: {
          type: "string",
          description:
            "PREFERRED. A unique substring of the target step's LaTeX (e.g. 'x=4', '(x+2)(x+3)') OR an exact match of its tutorReferenceLabel. Resolved newest-first, case-insensitive. 200 chars max. Use step_index ONLY when label-matching is impractical.",
        },
        step_index: {
          type: "number",
          description: "Fallback only. Zero-based positional index into the equation list (0 = first equation drawn). Prefer step_label — positional indices drift when new equations are added.",
        },
        style: {
          type: "string",
          enum: ["circle", "underline", "box"],
          description: "'circle' = hand-drawn ring. 'underline' = line beneath. 'box' = dashed rectangle around it.",
        },
      },
      required: ["style"],
    },
  },
  {
    name: "cross_out_step",
    description:
      "Draw a strikethrough through an existing step. Use when correcting a visible mistake, marking a wrong attempt, or showing 'this path doesn't work — let's try another'. Usually paired with add_student_attempt (capture the mistake) and draw_equation_step or add_equation_sequence (the correct continuation). Prefer step_label (a unique substring of the equation's LaTeX, e.g. 'x=4') over step_index; step_index is fallback only.",
    parameters: {
      type: "object",
      properties: {
        step_label: {
          type: "string",
          description:
            "PREFERRED. A unique substring of the target step's LaTeX OR an exact tutorReferenceLabel. Resolved newest-first, case-insensitive. 200 chars max.",
        },
        step_index: {
          type: "number",
          description: "Fallback only. Zero-based positional index. Prefer step_label.",
        },
      },
      required: [],
    },
  },
  {
    name: "add_table",
    description:
      "Render a 2D table for comparing values, showing data, or laying out a multi-case analysis. Great for truth tables, function value tables, unit conversions, before/after comparisons, kinetic vs potential energy, etc.",
    parameters: {
      type: "object",
      properties: {
        columns: {
          type: "string",
          description: "Pipe-separated column headers, e.g. 'x | y | y = x²'. 320 chars max.",
        },
        rows: {
          type: "string",
          description:
            "Rows separated by newlines (or ';'), cells within a row separated by '|'. Example: '-2 | -1 | 4\\n-1 | 0 | 1\\n0 | 1 | 0'. 1600 chars max.",
        },
        title: {
          type: "string",
          description: "Optional table caption, 160 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'.",
        },
      },
      required: ["columns", "rows"],
    },
  },
  {
    name: "add_number_line",
    description:
      "Draw a number line with optional labeled points or intervals. Perfect for inequalities, intervals, integer sets, fractions, signed numbers, and absolute-value problems.",
    parameters: {
      type: "object",
      properties: {
        min: {
          type: "number",
          description: "Left endpoint of the visible line.",
        },
        max: {
          type: "number",
          description: "Right endpoint of the visible line.",
        },
        points: {
          type: "string",
          description:
            "Optional comma-separated marks. Each mark: 'value' or 'value:label' (e.g. '0, 2:x≥2, -3'). For intervals, repeat: '2:lower, 5:upper'. 800 chars max.",
        },
        label: {
          type: "string",
          description: "Optional caption beneath the line, 160 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'.",
        },
      },
      required: ["min", "max"],
    },
  },
  {
    name: "add_coordinate_axes",
    description:
      "Draw an empty xy coordinate grid (no curve). Use when you're about to call plot_points, when discussing a coordinate concept without a specific function, or when you want the student to imagine plotting on it. If you have a y = f(x) function, prefer add_function_graph which renders the curve instantly.",
    parameters: {
      type: "object",
      properties: {
        x_min: { type: "number", description: "Minimum x." },
        x_max: { type: "number", description: "Maximum x." },
        y_min: { type: "number", description: "Minimum y." },
        y_max: { type: "number", description: "Maximum y." },
        label: { type: "string", description: "Optional caption, 160 chars max." },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'.",
        },
      },
      required: ["x_min", "x_max", "y_min", "y_max"],
    },
  },
  {
    name: "plot_points",
    description:
      "Plot discrete points on a coordinate grid, optionally connected. Use for scatter data, key points on a curve (vertex, intercepts, holes), or geometry constructions.",
    parameters: {
      type: "object",
      properties: {
        points: {
          type: "string",
          description:
            "Comma-separated points: '(x,y)' or '(x,y):label'. Example: '(0,0), (1,1):A, (2,4):B'. 800 chars max.",
        },
        x_min: { type: "number", description: "Minimum x of the grid." },
        x_max: { type: "number", description: "Maximum x of the grid." },
        y_min: { type: "number", description: "Minimum y of the grid." },
        y_max: { type: "number", description: "Maximum y of the grid." },
        label: { type: "string", description: "Optional plot caption, 160 chars max." },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'.",
        },
      },
      required: ["points", "x_min", "x_max", "y_min", "y_max"],
    },
  },
  {
    name: "add_worked_example_box",
    description:
      "Drop a boxed 'worked example' or 'key idea' callout on the board with a title and a body. Use to crystallize a takeaway after a derivation, to show a model problem before asking the student to try a similar one, or to summarize a definition.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short title, 160 chars max.",
        },
        body: {
          type: "string",
          description: "The example or key idea text, 1600 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'.",
        },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "add_function_graph",
    description:
      "Plot a continuous mathematical function y = f(x) on a coordinate grid. Use for any y = f(x) curve: parabolas, lines, trig, exponentials, absolute value, etc. Renders immediately. Prefer this over plot_points whenever you have a formula rather than discrete data.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "The function expression in terms of x, e.g. 'x^2 - 4*x - 5', 'sin(x)', '2*x + 3', 'abs(x - 2)'. Standard JS math operators: +, -, *, /, ^, sqrt(), sin(), cos(), tan(), abs(), log(). 200 chars max.",
        },
        x_min: {
          type: "number",
          description: "Minimum x value to plot.",
        },
        x_max: {
          type: "number",
          description: "Maximum x value to plot.",
        },
        label: {
          type: "string",
          description: "Optional caption below the graph, e.g. 'y = x² - 4x - 5'. 160 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'right'. Graphs usually pair best with equations on the left.",
        },
      },
      required: ["expression", "x_min", "x_max"],
    },
  },
  {
    name: "add_two_column_comparison",
    description:
      "Draw a side-by-side two-column comparison block — left column in red, right column in green. Use for: method A vs method B, before vs after, correct vs incorrect approach, two theorems, two historical figures. Renders immediately.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Heading above both columns, 160 chars max.",
        },
        left_title: {
          type: "string",
          description: "Header of the left (red) column, e.g. 'Method A', 'Before', 'Incorrect'. 80 chars max.",
        },
        left_body: {
          type: "string",
          description: "Content of the left column. Use newlines for multiple points. 800 chars max.",
        },
        right_title: {
          type: "string",
          description: "Header of the right (green) column, e.g. 'Method B', 'After', 'Correct'. 80 chars max.",
        },
        right_body: {
          type: "string",
          description: "Content of the right column. Use newlines for multiple points. 800 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'left'. Usually spans the full width of the left zone.",
        },
      },
      required: ["title", "left_title", "left_body", "right_title", "right_body"],
    },
  },
  {
    name: "add_vector_diagram",
    description:
      "Draw a vector diagram — a central label with labeled arrows radiating outward in named directions. Use for: force diagrams (weight down, normal up, friction left/right), velocity decompositions, field lines, resultant vectors. Renders immediately.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Caption above the diagram, e.g. 'Forces on block'. 160 chars max.",
        },
        center_label: {
          type: "string",
          description: "Label for the central object, e.g. 'block', 'particle'. 80 chars max.",
        },
        vectors: {
          type: "string",
          description:
            "Semicolon-separated vectors. Each: 'direction:label'. Direction must be one of: up, down, left, right, up-left, up-right, down-left, down-right. Example: 'up:Normal force N; down:Weight mg; right:Applied force F; left:Friction f'. 800 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'right'. Vector diagrams usually pair with equations on the left.",
        },
      },
      required: ["title", "center_label", "vectors"],
    },
  },
  {
    name: "add_process_map",
    description:
      "Draw a linear sequence of labeled boxes connected by arrows — a flow chart or process map. Use for: reaction mechanisms, decision trees, historical cause-effect chains, algorithm steps, writing process. Renders immediately.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Caption above the process map. 160 chars max.",
        },
        nodes: {
          type: "string",
          description:
            "Pipe-separated node labels in order, e.g. 'Identify forces | Draw free-body diagram | Apply Newton\\'s 2nd law | Solve for unknowns'. Each node becomes a labeled box. 8 nodes max. 800 chars total.",
        },
        connectors: {
          type: "string",
          description:
            "Optional newline-separated labels for each arrow between nodes. Count must be (nodes - 1). Leave blank for unlabeled arrows. 400 chars max.",
        },
        column: {
          type: "string",
          enum: ["left", "right"],
          description: "Default 'right'.",
        },
      },
      required: ["title", "nodes"],
    },
  },
  {
    name: "clear_whiteboard",
    description:
      "Erase EVERYTHING on the board. Almost always prefer start_new_problem instead, which clears AND titles in one call. Use clear_whiteboard only when you want a blank board with no heading.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];
