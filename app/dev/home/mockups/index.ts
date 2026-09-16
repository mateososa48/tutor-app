import type { ComponentType } from "react";
import BoardHome from "./BoardHome";
import AskHome from "./AskHome";
import CallHome from "./CallHome";
import NotebookHome from "./NotebookHome";
import LetterHome from "./LetterHome";
import BentoHome from "./BentoHome";
import NightHome from "./NightHome";
import PlanHome from "./PlanHome";
import CanvasHome from "./CanvasHome";
import SentenceHome from "./SentenceHome";
import SheetHome from "./SheetHome";
import SplitHome from "./SplitHome";
import TilesHome from "./TilesHome";
import StackHome from "./StackHome";
import DockHome from "./DockHome";
import IndexHome from "./IndexHome";
import ConsoleHome from "./ConsoleHome";
import StudioHome from "./StudioHome";
import DoorsTwoHome from "./DoorsTwoHome";
import DeskHome from "./DeskHome";
import StageHome from "./StageHome";

export const MOCKUPS: { name: string; Component: ComponentType }[] = [
  { name: "The board", Component: BoardHome },
  { name: "Ask first", Component: AskHome },
  { name: "Call your tutor", Component: CallHome },
  { name: "Notebook", Component: NotebookHome },
  { name: "A note from your tutor", Component: LetterHome },
  { name: "Bento", Component: BentoHome },
  { name: "Night desk", Component: NightHome },
  { name: "Today’s plan", Component: PlanHome },
  { name: "Table", Component: CanvasHome },
  { name: "Sentence", Component: SentenceHome },
  { name: "Sheet", Component: SheetHome },
  { name: "Doors", Component: SplitHome },
  { name: "Tiles", Component: TilesHome },
  { name: "Pages", Component: StackHome },
  { name: "Dock", Component: DockHome },
  { name: "Index", Component: IndexHome },
  { name: "Console", Component: ConsoleHome },
  { name: "Studio", Component: StudioHome },
  { name: "Two doors", Component: DoorsTwoHome },
  { name: "Desk", Component: DeskHome },
  { name: "Stage", Component: StageHome },
];
