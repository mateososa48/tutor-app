// Scripted tool calls for /dev/board. Each demo is the sequence a tutor would
// plausibly make, so the screenshots show real compositions, not one shape.

export type DemoCall = { name: string; args: Record<string, unknown> };

const fractions: DemoCall[] = [
  { name: "start_new_problem", args: { title: "One half" } },
  { name: "draw_fraction", args: { fraction: "1/2", model: "circle", label: "one half of the pizza" } },
  { name: "add_student_attempt", args: { text: "a half means one piece out of two" } },
  { name: "draw_fraction", args: { fraction: "3/4", second_fraction: "6/8", model: "bar", label: "the same amount, cut differently" } },
  { name: "add_number_line", args: { min: 0, max: 2, step: 0.25, points: "3/4:three quarters, 1 1/2", label: "quarters on a number line" } },
  { name: "draw_fraction", args: { fraction: "5/4", model: "circle", column: "right", label: "five quarters is more than one whole" } },
  { name: "add_callout", args: { text: "Same size pieces, or it is not a fair share.", style: "remember", column: "right" } },
];

const algebra: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Solving 2x + 3 = 11" } },
  { name: "add_problem_setup", args: { goal: "Find x", givens: "2x + 3 = 11", plan: "Undo the + 3, then undo the × 2" } },
  { name: "draw_balance", args: { left: "x | x | 3", right: "11", label: "2x + 3 = 11", column: "right" } },
  { name: "draw_equation_step", args: { latex: "2x + 3 = 11" } },
  { name: "add_student_attempt", args: { text: "subtract 3 from both sides?" } },
  { name: "draw_equation_step", args: { latex: "2x = 8", annotation: "subtract 3 from both sides" } },
  { name: "add_student_attempt", args: { text: "so x = 16?" } },
  { name: "draw_equation_step", args: { latex: "x = 16" } },
  { name: "cross_out_step", args: { step_label: "x = 16" } },
  { name: "draw_equation_step", args: { latex: "x = 4", annotation: "divide both sides by 2" } },
  { name: "highlight_step", args: { step_label: "x = 4", style: "circle" } },
  { name: "add_number_line", args: { min: -2, max: 6, points: "4:x = 4", jumps: "0>4:+4", column: "right" } },
  { name: "add_worked_example_box", args: { title: "Key idea", body: "Whatever you do to one side of the equals sign, do to the other side too. The balance stays level.", column: "right" } },
  { name: "start_board_section", args: { title: "Your turn" } },
  { name: "draw_equation_step", args: { latex: "3x - 5 = 7" } },
];

const geometry: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Pythagoras: finding the long side" } },
  { name: "draw_figure", args: { figure: "right_triangle", side_labels: "3 | 4 | ?", vertex_labels: "A | B | C", label: "a right triangle with legs 3 and 4" } },
  { name: "draw_equation_step", args: { latex: "a^2 + b^2 = c^2", column: "right" } },
  { name: "draw_equation_step", args: { latex: "3^2 + 4^2 = c^2", annotation: "plug in the legs", column: "right" } },
  { name: "draw_angle", args: { degrees: 37, caption: "the angle at B" } },
  { name: "draw_figure", args: { figure: "circle", radius_label: "r = 5", diameter_label: "d = 10", column: "right", label: "diameter is twice the radius" } },
  { name: "draw_figure", args: { figure: "rectangle", side_labels: "8 cm | 3 cm", label: "area = 8 × 3" } },
  { name: "draw_array", args: { rows: 3, columns: 7, split_after_column: 5, label: "3 × 7 = 3 × 5 + 3 × 2", column: "right" } },
  { name: "add_area_model", args: { title: "(x + 2)(x + 3)", row_labels: "x | 3", column_labels: "x | 2", cells: "x^2 | 2x; 3x | ", column: "right" } },
];

const data: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Reading a bar chart" } },
  { name: "draw_bar_chart", args: { categories: "Mon | Tue | Wed | Thu | Fri", values: "3 | 5 | 2 | 6 | 4", unit: "hours", label: "Hours of practice this week" } },
  { name: "add_table", args: { columns: "Day | Hours", rows: "Mon | 3; Tue | 5; Wed | 2", title: "The same data as a table", column: "right" } },
  { name: "add_number_line", args: { min: -5, max: 5, intervals: "(2..inf:x > 2; -inf..-3", points: "0", label: "x > 2 and x ≤ -3" } },
  { name: "add_function_graph", args: { expression: "x^2 - 4", x_min: -4, x_max: 4, label: "y = x² − 4", column: "right" } },
  { name: "plot_points", args: { points: "(1,1):A, (3,4):B, (-2,2):C", x_min: -4, x_max: 4, y_min: -4, y_max: 5, label: "three points", column: "right" } },
  { name: "draw_sketch", args: { strokes: "10,90 90,90; closed 10,90 90,90 90,35; 84,26 84,26", labels: "86,12:ball; 50,97:ground; 40,50:ramp", label: "a ball at the top of a ramp" } },
  { name: "add_vector_diagram", args: { title: "Forces on the ball", center_label: "ball", vectors: "down:Weight mg; up-right:Normal N; down-left:Friction f", column: "right" } },
];

// Pointing, ringing, erasing: the tutor's hands, not just its pen.
const marks: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Which piece is one half?" } },
  { name: "draw_fraction", args: { fraction: "1/2", model: "circle", label: "one half of the pizza" } },
  { name: "draw_fraction", args: { fraction: "2/4", model: "circle", label: "two quarters", column: "right" } },
  { name: "add_callout", args: { text: "Are these the same amount?", style: "hint" } },
  { name: "point_at", args: { target: "b2" } },
  { name: "circle_item", args: { target: "two quarters" } },
  { name: "add_student_attempt", args: { text: "no, four pieces is more" } },
  { name: "circle_item", args: { target: "last", keep: true } },
  { name: "draw_equation_step", args: { latex: "\\tfrac{2}{4} = \\tfrac{1}{2}" } },
  { name: "erase_items", args: { targets: "b6" } },
  { name: "point_at", args: { target: "last" } },
  { name: "erase_older", args: { keep: 2 } },
];

// The math pictures: tape diagrams, grids, stacked arithmetic, long
// division, transversals, solids, heights, slope triangles.
const math: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Math pictures" } },
  { name: "draw_tape_diagram", args: { rows: "Red: *4 | *4 = 8; Blue: 4 | 4 | 4 = 12", total_label: "20 marbles", label: "2 : 3" } },
  { name: "draw_grid", args: { rows: 10, columns: 10, shaded: 25, label: "25 out of 100 = 25% = 0.25", column: "right" } },
  { name: "write_vertical", args: { operands: "347 | 289", operation: "+", carries: "1 1", result: "636" } },
  { name: "write_vertical", args: { operands: "23 | 14", operation: "×", partial_products: "92 | 230", result: "322", column: "right" } },
  { name: "draw_long_division", args: { dividend: "156", divisor: "12", quotient: "13", steps: "-12 | 36 | -36 | 0" } },
  { name: "draw_figure", args: { figure: "triangle", side_labels: "8 | | ", height_label: "h = 5", label: "area = ½ × 8 × 5", column: "right" } },
  { name: "draw_figure", args: { figure: "parallelogram", side_labels: "10", height_label: "4", label: "area = base × height" } },
  { name: "draw_figure", args: { figure: "rectangular_prism", side_labels: "6 | 3 | 4", label: "volume = 6 × 3 × 4", column: "right" } },
  { name: "draw_figure", args: { figure: "cylinder", side_labels: "r = 3 | h = 8", label: "V = πr²h" } },
  { name: "draw_transversal", args: { angle_labels: "110° | ? | | | | 70° | |", mark_angles: "1 | 5", label: "corresponding angles are equal", column: "right" } },
  { name: "add_function_graph", args: { expression: "2*x + 1", x_min: -1, x_max: 4, slope_run: "1..3", mark_points: "(0,1):y-intercept", label: "slope = rise / run = 4 / 2 = 2" } },
  { name: "draw_array", args: { rows: 3, columns: 4, shaded: 3, label: "3 of 12 is one quarter", column: "right" } },
  { name: "draw_figure", args: { figure: "hexagon", side_labels: "5 | 5 | 5 | 5 | 5 | 5", label: "perimeter = 6 × 5" } },
  { name: "draw_figure", args: { figure: "trapezoid", side_labels: "12 | | 6 | ", height_label: "h = 4", column: "right" } },
  { name: "draw_angle", args: { degrees: 110, adjacent_degrees: 70, adjacent_label: "?", caption: "angles on a straight line add to 180°" } },
  { name: "add_number_line", args: { min: 0, max: 100, step: 25, second_min: 0, second_max: 80, second_label: "of 80", label: "25% of 80 = 20", column: "right" } },
  { name: "add_number_line", args: { min: 0, max: 1, step: 0.1, points: "0.7, 0.65:0.65", label: "0.7 is bigger than 0.65" } },
  { name: "plot_points", args: { points: "(1,1):A, (4,1):B, (4,3):C, (1,3):D", x_min: -1, x_max: 6, y_min: -1, y_max: 5, connect: true, label: "a 3 by 2 rectangle", column: "right" } },
  { name: "add_function_graph", args: { expression: "x + 1", second_expression: "-x + 5", x_min: -1, x_max: 5, label: "y = x + 1 and y = -x + 5 cross at (2, 3)" } },
];

const all: DemoCall[] = [
  ...fractions,
  ...algebra.slice(1),
  ...geometry.slice(1),
  ...data.slice(1),
  { name: "add_two_column_comparison", args: { title: "Which one is right?", left_title: "Incorrect", left_body: "2x = 8\nx = 16", right_title: "Correct", right_body: "2x = 8\nx = 4" } },
  { name: "add_process_map", args: { title: "How to solve it", nodes: "Read | Draw | Try | Check", connectors: "then | then | then", column: "right" } },
];

export const BOARD_DEMOS: Record<string, DemoCall[]> = { fractions, algebra, geometry, data, marks, math, all };
