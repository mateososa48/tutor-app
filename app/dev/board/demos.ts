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
  { name: "draw_fraction", args: { fraction: "1/2", second_fraction: "1/3", common_denominator: 6, model: "bar", label: "1/2 + 1/3 = 3/6 + 2/6" } },
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
  { name: "circle_item", args: { target: "x = 4", keep: true } },
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
  { name: "draw_grid", args: { rows: 3, columns: 4, shade_rows: 2, shade_columns: 3, label: "2/3 × 3/4 = 6/12", column: "right" } },
  { name: "add_number_line", args: { min: 0, max: 6, step: 1, points: "2, 2, 2, 3, 5, 5", label: "a dot plot of six scores", column: "right" } },
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
];

// Real things: counting, groups, taking away, comparing, an analogy.
const icons: DemoCall[] = [
  { name: "start_new_problem", args: { title: "12 ÷ 4" } },
  { name: "draw_icons", args: { icon: "cookie", count: 12, group_size: 4, label: "12 cookies in groups of 4" } },
  { name: "draw_icons", args: { icon: "apple", count: 7, crossed: 3, label: "7 apples, eat 3", column: "right" } },
  { name: "draw_icons", args: { icon: "coin", count: 8, second_icon: "dollar", second_count: 2, label: "8 coins and 2 bills" } },
  { name: "draw_icons", args: { icon: "pizza", count: 3, label: "three slices", column: "right" } },
  { name: "draw_icons", args: { icon: "car", count: 20, group_size: 5, column: "right", label: "20 cars in rows of 5" } },
  { name: "point_at", args: { target: "cookies" } },
  { name: "circle_item", args: { target: "apples" } },
];

// Equations under fire: the LaTeX a model really sends, tall lines, marks,
// erasing, and a snapshot round trip driven from the test harness.
const eqs: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Equations torture test" } },
  { name: "draw_equation_step", args: { latex: "\\frac{1}{2} + \\frac{1}{3} = \\frac{3}{6} + \\frac{2}{6}" } },
  { name: "draw_equation_step", args: { latex: "x² + y² ≤ 25", annotation: "unicode in" } },
  { name: "draw_equation_step", args: { latex: "3 × 4 = 12 and 12 ÷ 4 = 3" } },
  { name: "draw_equation_step", args: { latex: "\\sqrt{a^2 + b^2} = \\dfrac{\\frac{1}{2}}{3}", annotation: "tall" } },
  { name: "draw_equation_step", args: { latex: "area = 8 × 3 = 24 cm²" } },
  { name: "draw_equation_step", args: { latex: "\\frac{3}{4" , annotation: "broken brace" } },
  { name: "draw_equation_step", args: { latex: "y = 2x + 1 \\\\ y = -x + 4" , annotation: "two lines" } },
  { name: "add_equation_sequence", args: { title: "Solve", steps: "5x + 2 = 3x + 10 | 2x + 2 = 10 | 2x = 8 | x = 4", annotations: " | subtract 3x | subtract 2 | divide by 2", column: "right" } },
  { name: "highlight_step", args: { step_label: "x = 4", style: "circle" } },
  { name: "cross_out_step", args: { step_label: "2x + 2 = 10" } },
  { name: "circle_item", args: { target: "tall" } },
  { name: "point_at", args: { target: "unicode" } },
  { name: "erase_items", args: { targets: "broken brace" } },
  { name: "highlight_step", args: { style: "underline" } },
  { name: "draw_equation_step", args: { latex: "\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}", annotation: "a system", column: "right" } },
];

// Icon layout edge cases.
const icons2: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Icon layout edge cases" } },
  { name: "draw_icons", args: { icon: "balloon", count: 1, label: "one balloon" } },
  { name: "draw_icons", args: { icon: "cookies", count: 40, group_size: 10, label: "40 cookies in tens", column: "right" } },
  { name: "draw_icons", args: { icon: "apples", count: 20, group_size: 3, crossed: 5, label: "20 in threes, 5 eaten" } },
  { name: "draw_icons", args: { icon: "kids", count: 7, group_size: 7, second_icon: "pizza slices", second_count: 14, label: "7 kids, 14 slices", column: "right" } },
  { name: "draw_icons", args: { icon: "coins", count: 6, crossed: 6, label: "spent them all" } },
  { name: "draw_icons", args: { icon: "ice cream", count: 9, second_icon: "money", second_count: 3, label: "9 ice creams, 3 coins" } },
  // Arrangements and a count past the old 40 cap (Sept 15).
  { name: "draw_icons", args: { icon: "apple", count: 55, group_size: 5, label: "55 apples in groups of 5", column: "right" } },
  { name: "draw_icons", args: { icon: "cookie", count: 24, arrange: "array", columns: 6, label: "24 cookies, 6 to a row" } },
  { name: "draw_icons", args: { icon: "star", count: 23, arrange: "ten_frame", label: "23 in ten-frames", column: "right" } },
  { name: "draw_icons", args: { icon: "coin", count: 12, group_size: 3, arrange: "groups", label: "12 coins in 4 groups of 3" } },
  { name: "draw_icons", args: { icon: "boy", count: 10, arrange: "ring", label: "10 kids round a table", column: "right" } },
  { name: "circle_item", args: { target: "40 cookies" } },
];

// Whiteboard layout (Sept 14 2026). No column arguments, so this is the
// default placement: words down the left, pictures beside them, the next
// column once the first is full, then a section as the next panel.
const layout: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Adding 1/4 and 1/2" } },
  { name: "add_text_note", args: { text: "Can we add 1/4 and 1/2 straight away?" } },
  { name: "draw_fraction", args: { fraction: "1/4", second_fraction: "1/2", model: "bar", label: "quarters and halves are different sizes" } },
  { name: "draw_equation_step", args: { latex: "\\frac{1}{4} + \\frac{1}{2}" } },
  { name: "draw_equation_step", args: { latex: "= \\frac{1}{4} + \\frac{2}{4}", annotation: "cut the half into quarters" } },
  { name: "draw_fraction", args: { fraction: "1/4", second_fraction: "2/4", model: "bar", label: "same size pieces now" } },
  { name: "draw_equation_step", args: { latex: "= \\frac{3}{4}" } },
  { name: "add_number_line", args: { min: 0, max: 1, step: 0.25, points: "3/4:three quarters" } },
  { name: "add_callout", args: { text: "Make the pieces the same size first, then add.", style: "remember" } },
  { name: "add_student_attempt", args: { text: "so 1/3 + 1/2 = 2/5?" } },
  { name: "start_board_section", args: { title: "Your turn" } },
  { name: "draw_equation_step", args: { latex: "\\frac{1}{3} + \\frac{1}{6}" } },
  { name: "draw_fraction", args: { fraction: "1/3", second_fraction: "1/6", model: "bar", place: "beside b12" } },
];

// Board content (Sept 16 2026): pipes become new lines, a non-answer and
// praise are refused, a repeat points at what is already up, the callout is
// a small sky tag, a number line says the values of its dots, a sketch's
// labels sit on the strokes they name, a right triangle's labels are the legs
// then the hypotenuse, notes beside lines read at 16 px, and empty
// annotation slots keep the others on their own lines.
const content: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Slope from two points" } },
  { name: "add_text_note", args: { text: "Point 1: (2, 3) | Point 2: (6, 11)" } },
  { name: "add_student_attempt", args: { text: "i dont know" } },
  { name: "add_callout", args: { text: "Perfect slope calculation!", style: "correct" } },
  { name: "add_callout", args: { text: "Which change goes on top?", style: "hint" } },
  { name: "add_text_note", args: { text: "Point 1: (2, 3) | Point 2: (6, 11)" } },
  { name: "draw_equation_step", args: { latex: "\\text{slope} = \\frac{11 - 3}{6 - 2}", annotation: "change in y over change in x" } },
  { name: "add_number_line", args: { min: 0, max: 12, step: 2, points: "3:P1y, 11:P2y, 10:ten" } },
  { name: "draw_sketch", args: { strokes: "10,80 90,80;10,80 90,20;90,20 90,80", labels: "60,20:rise = 8;30,60:run = 4", label: "slope = rise over run" } },
  { name: "start_board_section", args: { title: "Pythagoras" } },
  { name: "draw_figure", args: { figure: "right_triangle", side_labels: "6 | 8 | x" } },
  { name: "draw_equation_step", args: { latex: "6^2 + 8^2 = x^2", annotation: "the legs squared add up" } },
  { name: "add_equation_sequence", args: { steps: "36 + 64 = x^2 | 100 = x^2 | x = 10", annotations: "| | take the square root" } },
  { name: "circle_item", args: { target: "last", keep: true } },
];

// Cancelled calls (Sept 16 2026). Calls are c0, c1, … by position; "__undo"
// takes one back the way a live call the model cancelled is taken back: a
// drawing, a highlight, a strike, and a new problem (the old board returns).
const cancel: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Taking back cancelled calls" } },
  { name: "draw_equation_step", args: { latex: "2x + 3 = 11" } },
  { name: "draw_fraction", args: { fraction: "3/4" } },
  { name: "__undo", args: { call: "c2" } },
  { name: "draw_equation_step", args: { latex: "2x = 8", annotation: "subtract 3 from both sides" } },
  { name: "highlight", args: { target: "last", text: "8" } },
  { name: "cross_out_step", args: { step_label: "2x + 3" } },
  { name: "__undo", args: { call: "c5" } },
  { name: "__undo", args: { call: "c6" } },
  { name: "start_new_problem", args: { title: "A new problem, cancelled" } },
  { name: "__undo", args: { call: "c9" } },
];

// Sections and pages (Sept 16 2026). A section opens as a panel beside the
// work while there is width, then as a band under it; "new page" on a board
// with room stays put; a free area named in [Board: …] is a valid place; a
// page opens only when nothing fits, and pointing back turns the board.
const sections: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Solve 3x + 7 = 25" } },
  { name: "draw_equation_step", args: { latex: "3x + 7 = 25" } },
  { name: "draw_balance", args: { left: "x | x | x | 7", right: "25", label: "3x + 7 = 25" } },
  { name: "draw_equation_step", args: { latex: "3x = 18", annotation: "subtract 7 from both sides" } },
  { name: "draw_equation_step", args: { latex: "x = 6", annotation: "divide both sides by 3" } },
  { name: "start_board_section", args: { title: "Check it" } },
  { name: "draw_equation_step", args: { latex: "3(6) + 7 = 25" } },
  { name: "draw_equation_step", args: { latex: "25 = 25", place: "new page" } },
  { name: "circle_item", args: { target: "last", keep: true } },
  { name: "start_board_section", args: { title: "Your turn: 5(x - 2) = 3x + 8" } },
  { name: "draw_equation_step", args: { latex: "5(x - 2) = 3x + 8" } },
  { name: "add_text_note", args: { text: "Share the 5 first", place: "bottom left" } },
  { name: "start_board_section", args: { title: "One more" } },
  { name: "draw_figure", args: { figure: "rectangle", side_labels: "8 cm | 3 cm" } },
  { name: "start_board_section", args: { title: "Last one" } },
  { name: "draw_equation_step", args: { latex: "2x + 1 = 9" } },
  { name: "point_at", args: { target: "b2" } },
];

// The highlighter: part of a line, a number on a number line, a student's
// mistake, a whole line, and a ring around a drawing.
const highlight: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Solving 2x + 3 = 11" } },
  { name: "draw_equation_step", args: { latex: "2x + 3 = 11" } },
  { name: "draw_balance", args: { left: "x | x | 3", right: "11", label: "2x + 3 = 11" } },
  { name: "highlight", args: { target: "b2", text: "+ 3" } },
  { name: "draw_equation_step", args: { latex: "2x = 8", annotation: "subtract 3 from both sides" } },
  { name: "highlight", args: { target: "b4", text: "8" } },
  { name: "add_student_attempt", args: { text: "so x = 16?" } },
  { name: "highlight", args: { target: "b5", text: "16" } },
  { name: "draw_equation_step", args: { latex: "x = 4", annotation: "divide both sides by 2" } },
  { name: "highlight", args: { target: "b6" } },
  { name: "add_number_line", args: { min: -2, max: 6, points: "4:x = 4" } },
  { name: "highlight", args: { target: "b7", text: "4" } },
  { name: "highlight", args: { target: "b3" } },
  { name: "highlight", args: { target: "b2", text: "11" } },
];

// Desmos graphs (Sept 15 2026): every graph tool, plain math converted, a
// slope triangle, inequality + circle + vertical line, a shape from points,
// and highlights on a labelled point and on the rise. Sept 17: a system of
// inequalities and a disc for the vector fallback; add &nodesmos=1 to see
// every graph without Desmos, &desmosfail=1 to see them swap when the load fails.
const graphs: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Graphs, drawn by Desmos" } },
  { name: "add_function_graph", args: { expression: "x^2-4x+3", x_min: -2, x_max: 6, y_min: -2, y_max: 5, mark_points: "(1,0):root, (3,0):root, (2,-1):vertex", label: "y = x² − 4x + 3" } },
  { name: "add_function_graph", args: { expression: "2x-1", second_expression: "-x+5", x_min: -2, x_max: 6, label: "two lines crossing" } },
  { name: "add_function_graph", args: { expression: "\\frac{1}{x}", x_min: -4, x_max: 4, label: "y = 1/x" } },
  { name: "add_function_graph", args: { expression: "2*x+1", x_min: -1, x_max: 4, slope_run: "1..3", mark_points: "(0,1):y-intercept", label: "slope = rise / run" } },
  { name: "add_function_graph", args: { expression: "2x-1", extra_expressions: "y>2x-1; x^2+y^2=9; x=3", x_min: -5, x_max: 5, label: "an inequality, a circle, a vertical line" } },
  { name: "plot_points", args: { points: "(1,1):A, (4,1):B, (4,3):C", x_min: -1, x_max: 6, y_min: -1, y_max: 5, connect: true, label: "triangle ABC" } },
  { name: "add_function_graph", args: { expression: "sqrt(x)", x_min: -1, x_max: 9, label: "sqrt(x), written plainly" } },
  { name: "add_function_graph", args: { expression: "-2x/3+2", extra_expressions: "2x+3y<6; x>=-1", x_min: -4, x_max: 6, label: "two inequalities at once" } },
  { name: "add_function_graph", args: { expression: "x^2", extra_expressions: "(x-1)^2+(y+2)^2<4; 2x+1\\left\\{0<x<3\\right\\}", x_min: -5, x_max: 5, label: "a disc and a piece of a line" } },
  { name: "add_coordinate_axes", args: { x_min: -10, x_max: 10, y_min: -10, y_max: 10, label: "empty axes" } },
  { name: "highlight", args: { target: "b2", text: "vertex" } },
  { name: "highlight", args: { target: "b5", text: "rise 4" } },
];

// Marks (Sept 16): every mark lands on its item and in sky, whatever the
// queue is doing. Play it at &step=6000 too: an idle queue used to draw a
// highlight inside the tool call and move it into empty space.
const rings: DemoCall[] = [
  { name: "start_new_problem", args: { title: "Marks land on what they mark" } },
  { name: "add_text_note", args: { text: "A long line of words that runs most of the way across the board page" } },
  { name: "circle_item", args: { target: "b2", keep: true } },
  { name: "circle_item", args: { target: "b2", keep: true } },
  { name: "draw_equation_step", args: { latex: "\\frac{3}{4} + \\frac{1}{4} = 1", annotation: "same size pieces" } },
  { name: "circle_item", args: { target: "last", keep: true } },
  { name: "highlight", args: { target: "b3", text: "3/4" } },
  { name: "add_student_attempt", args: { text: "3/4 + 1/4 = 4/8" } },
  { name: "highlight_step", args: { step_label: "4/8", style: "box" } },
  { name: "cross_out_step", args: { step_label: "4/8" } },
  { name: "draw_figure", args: { figure: "rectangle", side_labels: "8 cm | 3 cm" } },
  { name: "highlight", args: { target: "b5" } },
  { name: "circle_item", args: { target: "b5" } },
  { name: "highlight_step", args: { step_label: "long line", style: "underline" } },
];

export const BOARD_DEMOS: Record<string, DemoCall[]> = { fractions, algebra, geometry, data, marks, rings, math, icons, icons2, eqs, layout, sections, content, cancel, highlight, graphs, all };
