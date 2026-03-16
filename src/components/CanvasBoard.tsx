import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Circle, Text, Group, Transformer } from 'react-konva';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, handleFirestoreError } from '../App';
import { CanvasElement, OperationType } from '../types';
import { Type, Square, Circle as CircleIcon, StickyNote, Trash2, MousePointer2, Palette } from 'lucide-react';

const COLORS = [
  '#5A5A40', // Olive
  '#1a1a1a', // Black
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#fef3c7', // Light Yellow
];

interface CanvasBoardProps {
  noteId: string;
  ownerId: string;
}

export default function CanvasBoard({ noteId, ownerId }: CanvasBoardProps) {
  const { user } = useAuth();
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (!user || !noteId || !ownerId) return;

    const elementsRef = collection(db, 'users', ownerId, 'notes', noteId, 'elements');
    const unsubscribe = onSnapshot(elementsRef, (snapshot) => {
      const elementsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CanvasElement[];
      setElements(elementsData);
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${ownerId}/notes/${noteId}/elements`));

    return () => unsubscribe();
  }, [user, noteId, ownerId]);

  const addElement = async (type: CanvasElement['type']) => {
    if (!user || !noteId || !ownerId) return;
    const newElement: Omit<CanvasElement, 'id'> = {
      type,
      x: 100,
      y: 100,
      text: type === 'text' || type === 'sticky' ? 'Double click to edit' : '',
      color: type === 'sticky' ? '#fef3c7' : (type === 'text' ? '#1a1a1a' : '#5A5A40'),
      width: type === 'sticky' ? 150 : 100,
      height: type === 'sticky' ? 150 : 100,
      rotation: 0
    };
    try {
      await addDoc(collection(db, 'users', ownerId, 'notes', noteId, 'elements'), newElement);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${ownerId}/notes/${noteId}/elements`);
    }
  };

  const updateElement = async (id: string, attrs: Partial<CanvasElement>) => {
    if (!user || !noteId || !ownerId) return;
    try {
      await updateDoc(doc(db, 'users', ownerId, 'notes', noteId, 'elements', id), attrs);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${ownerId}/notes/${noteId}/elements/${id}`);
    }
  };

  const deleteElement = async () => {
    if (!user || !noteId || !ownerId || !selectedId) return;
    try {
      await deleteDoc(doc(db, 'users', ownerId, 'notes', noteId, 'elements', selectedId));
      setSelectedId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${ownerId}/notes/${noteId}/elements/${selectedId}`);
    }
  };

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
  };

  const checkDeselect = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      handleSelect(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F5F5F0] relative overflow-hidden">
      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 p-2 bg-white rounded-2xl shadow-lg border border-[#E5E5E0]">
        <ToolbarButton icon={<MousePointer2 size={18} />} onClick={() => handleSelect(null)} active={!selectedId} />
        <div className="w-px h-6 bg-[#E5E5E0] mx-1" />
        <ToolbarButton icon={<Type size={18} />} onClick={() => addElement('text')} />
        <ToolbarButton icon={<StickyNote size={18} />} onClick={() => addElement('sticky')} />
        <ToolbarButton icon={<Square size={18} />} onClick={() => addElement('rect')} />
        <ToolbarButton icon={<CircleIcon size={18} />} onClick={() => addElement('circle')} />
        <div className="w-px h-6 bg-[#E5E5E0] mx-1" />
        <ToolbarButton 
          icon={<Trash2 size={18} />} 
          onClick={deleteElement} 
          disabled={!selectedId}
          className="text-red-500 hover:bg-red-50" 
        />

        {selectedId && (
          <>
            <div className="w-px h-6 bg-[#E5E5E0] mx-1" />
            <div className="flex items-center gap-1.5 px-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => updateElement(selectedId, { color })}
                  className="w-6 h-6 rounded-full border border-black/10 transition-transform hover:scale-110 active:scale-95"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Stage
        width={window.innerWidth - 320}
        height={window.innerHeight - 160}
        onMouseDown={checkDeselect}
        onTouchStart={checkDeselect}
        ref={stageRef}
        className="cursor-crosshair"
      >
        <Layer>
          {elements.map((el) => (
            <Element 
              key={el.id} 
              shapeProps={el} 
              isSelected={el.id === selectedId}
              onSelect={() => handleSelect(el.id)}
              onChange={(newAttrs) => updateElement(el.id, newAttrs)}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

function ToolbarButton({ icon, onClick, active, disabled, className }: any) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-xl transition-all ${
        active ? 'bg-[#5A5A40] text-white' : 'text-[#5A5A40] hover:bg-[#F5F5F0]'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : ''} ${className}`}
    >
      {icon}
    </button>
  );
}

function Element({ shapeProps, isSelected, onSelect, onChange }: any) {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const handleTextEdit = () => {
    const newText = window.prompt('Enter text:', shapeProps.text);
    if (newText !== null) {
      onChange({ text: newText });
    }
  };

  return (
    <>
      {shapeProps.type === 'rect' && (
        <Rect
          onClick={onSelect}
          onTap={onSelect}
          ref={shapeRef}
          {...shapeProps}
          draggable
          fill={shapeProps.color}
          onDragEnd={(e) => {
            onChange({
              x: e.target.x(),
              y: e.target.y(),
            });
          }}
          onTransformEnd={() => {
            const node = shapeRef.current;
            onChange({
              x: node.x(),
              y: node.y(),
              width: Math.max(5, node.width() * node.scaleX()),
              height: Math.max(5, node.height() * node.scaleY()),
              rotation: node.rotation(),
            });
            node.scaleX(1);
            node.scaleY(1);
          }}
        />
      )}
      {shapeProps.type === 'circle' && (
        <Circle
          onClick={onSelect}
          onTap={onSelect}
          ref={shapeRef}
          {...shapeProps}
          draggable
          fill={shapeProps.color}
          onDragEnd={(e) => {
            onChange({
              x: e.target.x(),
              y: e.target.y(),
            });
          }}
        />
      )}
      {shapeProps.type === 'text' && (
        <Text
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={handleTextEdit}
          ref={shapeRef}
          {...shapeProps}
          draggable
          fontSize={20}
          fontFamily="serif"
          fill={shapeProps.color || "#1a1a1a"}
          onDragEnd={(e) => {
            onChange({
              x: e.target.x(),
              y: e.target.y(),
            });
          }}
        />
      )}
      {shapeProps.type === 'sticky' && (
        <Group
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={handleTextEdit}
          ref={shapeRef}
          draggable
          x={shapeProps.x}
          y={shapeProps.y}
          onDragEnd={(e) => {
            onChange({
              x: e.target.x(),
              y: e.target.y(),
            });
          }}
        >
          <Rect
            width={shapeProps.width}
            height={shapeProps.height}
            fill={shapeProps.color}
            shadowBlur={10}
            shadowOpacity={0.1}
            cornerRadius={4}
          />
          <Text
            text={shapeProps.text}
            width={shapeProps.width}
            height={shapeProps.height}
            padding={20}
            fontSize={16}
            fontFamily="serif"
            fill="#5A5A40"
            align="center"
            verticalAlign="middle"
          />
        </Group>
      )}
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
}
