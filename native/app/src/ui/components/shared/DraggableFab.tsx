import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";

const INTERACTIONS_PANEL_WIDTH = 400;

interface DraggableFabProps {
  onClick: () => void;
  icon?: ReactNode;
  color?: "primary" | "secondary" | "default" | "inherit" | "error" | "info" | "success" | "warning";
}

export function DraggableFab({ onClick, icon = <AddIcon />, color = "primary" }: DraggableFabProps) {
  const [fabPosition, setFabPosition] = useState({
    bottom: 16,
    right: INTERACTIONS_PANEL_WIDTH + 16,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mouseDownPosition, setMouseDownPosition] = useState({ x: 0, y: 0 });

  const handleFabMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
    setIsDragging(true);
    setHasDragged(false); // Reset on each mousedown
    setMouseDownPosition({ x: e.clientX, y: e.clientY });
    setDragOffset({
      x: e.clientX - (window.innerWidth - fabPosition.right),
      y: e.clientY - (window.innerHeight - fabPosition.bottom),
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (isDragging) {
        // Calculate distance moved from initial mousedown position
        const deltaX = Math.abs(e.clientX - mouseDownPosition.x);
        const deltaY = Math.abs(e.clientY - mouseDownPosition.y);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Only mark as dragged if moved more than 5 pixels (threshold for intentional drag)
        if (distance > 5) {
          setHasDragged(true);
        }

        const newRight = window.innerWidth - e.clientX + dragOffset.x;
        const newBottom = window.innerHeight - e.clientY + dragOffset.y;
        setFabPosition({
          right: Math.max(16, newRight),
          bottom: Math.max(16, newBottom),
        });
      }
    };

    const handleMouseUp = () => {
      // If we didn't drag, trigger the click
      if (isDragging && !hasDragged) {
        onClick();
      }
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset, mouseDownPosition, hasDragged, onClick]);

  return (
    <Fab
      color={color}
      sx={{
        position: "absolute",
        bottom: fabPosition.bottom,
        right: fabPosition.right,
        cursor: isDragging && hasDragged ? "grabbing" : "pointer",
      }}
      onMouseDown={handleFabMouseDown}
    >
      {isDragging && hasDragged ? <DragIndicatorIcon /> : icon}
    </Fab>
  );
}
