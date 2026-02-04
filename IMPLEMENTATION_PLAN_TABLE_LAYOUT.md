# Table Layout Editor - Implementation Plan

## Tech Stack Decision: React Flow (Hybrid Approach) ✅

### Why React Flow?
1. **Production-ready** - Battle-tested library used by thousands
2. **Feature-complete** - Drag & drop, pan, zoom, snapping built-in
3. **Customizable** - Full control over node appearance
4. **Performant** - Handles hundreds of nodes
5. **TypeScript support** - Type safety
6. **Active maintenance** - Regular updates

### Alternative Considered: Native HTML5 Drag & Drop
❌ **Rejected** because:
- Need to implement pan, zoom, grid snapping manually
- Complex coordinate transformation logic
- Touch device compatibility issues
- More code to maintain
- Reinventing the wheel

---

## Phase 1: Setup React Flow

### 1.1 Install Dependencies
```bash
npm install reactflow
```

### 1.2 File Structure
```
src/apps/table-layout-editor/
├── App.jsx                    # Main app wrapper
├── main.jsx                   # Entry point
├── components/
│   ├── LayoutCanvas.jsx       # React Flow canvas
│   ├── TableNode.jsx          # Custom table node
│   ├── ToolbarPanel.jsx       # Add table, shapes, etc
│   ├── PropertiesPanel.jsx    # Edit selected node
│   └── FloorSelector.jsx      # Switch between floors
├── hooks/
│   ├── useLayoutData.jsx      # Fetch/save layout
│   └── useFloors.jsx          # Manage floors
└── utils/
    ├── nodeFactory.js         # Create new nodes
    └── layoutSerializer.js    # Convert to/from API format
```

---

## Phase 2: Core Components

### 2.1 TableNode Component
Custom React Flow node for restaurant tables:

```jsx
import { Handle, Position } from 'reactflow'

export function TableNode({ data, selected }) {
  const shapes = {
    round: '⭕',
    rectangle: '⬜',
    booth: '🛋️'
  }
  
  return (
    <div 
      className={`table-node ${data.shape} ${selected ? 'selected' : ''}`}
      style={{
        width: data.width || 100,
        height: data.height || 100,
        background: data.backgroundColor || '#fff',
        border: selected ? '3px solid #667eea' : '2px solid #e5e7eb',
        borderRadius: data.shape === 'round' ? '50%' : '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        cursor: 'move',
        boxShadow: selected ? '0 4px 12px rgba(102, 126, 234, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
        {shapes[data.shape] || '🪑'}
      </div>
      <strong>{data.label}</strong>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
        {data.capacity} seats
      </div>
      {data.status && (
        <div 
          className={`status-badge status-${data.status}`}
          style={{
            marginTop: '0.5rem',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.7rem',
            fontWeight: 'bold',
            background: data.status === 'Occupied' ? '#fee' : '#efe',
            color: data.status === 'Occupied' ? '#c00' : '#060'
          }}
        >
          {data.status}
        </div>
      )}
    </div>
  )
}
```

### 2.2 LayoutCanvas Component
Main React Flow canvas:

```jsx
import { useCallback, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel
} from 'reactflow'
import 'reactflow/dist/style.css'
import { TableNode } from './TableNode'

const nodeTypes = {
  table: TableNode
}

export function LayoutCanvas({ floor, onSave }) {
  const { data: layout, mutate } = useLayoutData(floor)
  const [nodes, setNodes, onNodesChange] = useNodesState(layout?.nodes || [])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState(null)

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const handleSave = async () => {
    const layoutData = {
      floor: floor,
      nodes: nodes.map(node => ({
        id: node.id,
        table: node.data.table,
        label: node.data.label,
        position_x: node.position.x,
        position_y: node.position.y,
        width: node.data.width,
        height: node.data.height,
        shape: node.data.shape,
        rotation: node.data.rotation || 0
      }))
    }
    
    await apiCall('imogi_pos.api.layout.save_table_layout', {
      floor: floor,
      layout_json: JSON.stringify(layoutData)
    })
    
    mutate()
    onSave?.()
  }

  return (
    <div style={{ height: '600px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid={true}
        snapGrid={[15, 15]}
      >
        <Background variant="dots" gap={15} size={1} />
        <Controls />
        <MiniMap nodeColor="#667eea" />
        <Panel position="top-right">
          <button onClick={handleSave} className="btn-success">
            💾 Save Layout
          </button>
        </Panel>
      </ReactFlow>
      
      {selectedNode && (
        <PropertiesPanel 
          node={selectedNode} 
          onUpdate={(updated) => {
            setNodes(nds => nds.map(n => 
              n.id === selectedNode.id ? { ...n, data: { ...n.data, ...updated } } : n
            ))
          }}
          onDelete={() => {
            setNodes(nds => nds.filter(n => n.id !== selectedNode.id))
            setSelectedNode(null)
          }}
        />
      )}
    </div>
  )
}
```

### 2.3 ToolbarPanel Component
Add new tables and objects:

```jsx
export function ToolbarPanel({ floor, onAddNode }) {
  const addTable = (shape = 'rectangle') => {
    const newNode = {
      id: `table-${Date.now()}`,
      type: 'table',
      position: { x: 100, y: 100 },
      data: {
        label: `Table ${Date.now()}`,
        shape: shape,
        capacity: 4,
        width: 100,
        height: 100,
        backgroundColor: '#ffffff'
      }
    }
    onAddNode(newNode)
  }

  return (
    <div className="toolbar-panel">
      <h3>Add Elements</h3>
      <div className="toolbar-buttons">
        <button onClick={() => addTable('rectangle')}>
          ⬜ Rectangle Table
        </button>
        <button onClick={() => addTable('round')}>
          ⭕ Round Table
        </button>
        <button onClick={() => addTable('booth')}>
          🛋️ Booth
        </button>
      </div>
    </div>
  )
}
```

### 2.4 PropertiesPanel Component
Edit selected node:

```jsx
export function PropertiesPanel({ node, onUpdate, onDelete }) {
  const [label, setLabel] = useState(node.data.label)
  const [capacity, setCapacity] = useState(node.data.capacity)
  const [width, setWidth] = useState(node.data.width)
  const [height, setHeight] = useState(node.data.height)

  const handleApply = () => {
    onUpdate({ label, capacity, width, height })
  }

  return (
    <div className="properties-panel">
      <h3>Table Properties</h3>
      
      <label>
        Label:
        <input value={label} onChange={e => setLabel(e.target.value)} />
      </label>
      
      <label>
        Capacity:
        <input type="number" value={capacity} onChange={e => setCapacity(+e.target.value)} />
      </label>
      
      <label>
        Width:
        <input type="number" value={width} onChange={e => setWidth(+e.target.value)} />
      </label>
      
      <label>
        Height:
        <input type="number" value={height} onChange={e => setHeight(+e.target.value)} />
      </label>
      
      <div className="button-group">
        <button onClick={handleApply} className="btn-primary">Apply</button>
        <button onClick={onDelete} className="btn-error">Delete</button>
      </div>
    </div>
  )
}
```

---

## Phase 3: Integration with Backend

### 3.1 Data Flow
```
Frontend (React Flow)          Backend (Frappe)
-----------------              ----------------
1. Load layout
   GET layout.get_table_layout(floor)
   ↓
2. Convert to React Flow nodes
   nodes = layout.nodes.map(n => ({
     id: n.id,
     position: { x: n.position_x, y: n.position_y },
     data: { ...n }
   }))
   ↓
3. User drags/edits
   ↓
4. Save layout
   POST layout.save_table_layout({
     floor: 'Main Floor',
     layout_json: JSON.stringify({
       nodes: nodes.map(n => ({
         table: n.data.table,
         position_x: n.position.x,
         position_y: n.position.y,
         ...
       }))
     })
   })
```

### 3.2 API Hooks
```jsx
// hooks/useLayoutData.jsx
export function useLayoutData(floor) {
  return useSWR(
    floor ? ['layout', floor] : null,
    () => apiCall('imogi_pos.api.layout.get_table_layout', { floor })
  )
}

export function useFloors(branch) {
  return useSWR(
    branch ? ['floors', branch] : null,
    () => apiCall('imogi_pos.api.layout.get_floors')
  )
}
```

---

## Phase 4: Advanced Features

### 4.1 Multi-Floor Support
- Tabs for switching between floors
- Each floor has independent layout
- Share table definitions across floors

### 4.2 Background Image
- Upload floor plan image
- Set as canvas background
- Align tables over image

### 4.3 Grouping & Sections
- Group tables by section (VIP, Outdoor, etc)
- Visual section boundaries
- Collapse/expand sections

### 4.4 Real-time Status
- WebSocket/polling for table status updates
- Color-code by status (Available, Occupied, Reserved)
- Show current order details on hover

### 4.5 Templates
- Save layouts as templates
- Quick-apply for new branches
- Library of common layouts (Fine Dining, Cafe, Food Court)

---

## Phase 5: Testing & Deployment

### 5.1 Testing Checklist
- [ ] Drag & drop smoothness
- [ ] Save/load persistence
- [ ] Multi-floor switching
- [ ] Touch device support (iPad for restaurant managers)
- [ ] Performance with 100+ tables
- [ ] Undo/redo functionality

### 5.2 Deployment Steps
1. Build React app: `npm run build:table-layout-editor`
2. Test in Frappe Desk integration
3. Add to restaurant module navigation
4. User documentation & video tutorial
5. Gradual rollout to beta users

---

## Timeline Estimate

- **Week 1**: Setup React Flow, basic canvas, table nodes
- **Week 2**: Toolbar, properties panel, save/load
- **Week 3**: Multi-floor, styling, UX polish
- **Week 4**: Testing, bug fixes, deployment

**Total: 4 weeks** for production-ready editor

---

## Cost Comparison

| Approach | Development Time | Maintenance | Features | Risk |
|----------|-----------------|-------------|----------|------|
| **React Flow** | 4 weeks | Low | Complete | Low ✅ |
| Native HTML5 | 8-10 weeks | High | Limited | High ❌ |

---

## Recommendation

**Go with React Flow** - Save 50% development time, get enterprise-grade features, minimal maintenance burden.

Next steps:
1. Install React Flow: `npm install reactflow`
2. Create basic canvas (1 day)
3. Add table nodes (2 days)
4. Integrate with backend (3 days)
5. Polish & test (4 days)

**Ready to start implementation?**
