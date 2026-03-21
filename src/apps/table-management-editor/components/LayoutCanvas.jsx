import { useCallback, useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  applyNodeChanges,
  applyEdgeChanges
} from 'reactflow'
import 'reactflow/dist/style.css'
import { TableNode } from './TableNode'
import { PropertiesPanel } from './PropertiesPanel'
import { apiCall } from '../../../shared/utils/api'
import { API } from '@/shared/api/constants'
import { convertToReactFlowNodes, convertToBackendFormat } from '../utils/layoutSerializer'

const nodeTypes = {
  table: TableNode
}

export const LayoutCanvas = forwardRef(function LayoutCanvas({ floor, onSave, initialLayout }, ref) {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const isDirtyRef = useRef(false)

  // Derive selectedNode fresh from nodes on every render — no stale references
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null

  // Load initial layout only when not dirty (don't wipe user's unsaved edits)
  useEffect(() => {
    if (initialLayout?.tables && !isDirtyRef.current) {
      const flowNodes = convertToReactFlowNodes(initialLayout.tables)
      setNodes(flowNodes)
    }
  }, [initialLayout])

  const onNodesChange = useCallback((changes) => {
    isDirtyRef.current = true
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  const onNodeClick = useCallback((event, node) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const handleSave = async () => {
    if (!floor) {
      window.frappe?.show_alert?.({ 
        message: 'Please select a floor first', 
        indicator: 'orange' 
      })
      return
    }

    setIsSaving(true)
    try {
      const layoutData = convertToBackendFormat(nodes, floor)
      
      const response = await apiCall(API.SAVE_TABLE_LAYOUT, {
        floor: floor,
        layout_json: JSON.stringify(layoutData)
      })
      
      // Reset dirty flag — layout is now persisted
      isDirtyRef.current = false
      onSave?.(response)
    } catch (error) {
      console.error('[imogi][layout] Save failed:', error)
      window.frappe?.show_alert?.({ 
        message: `Save failed: ${error.message || 'Unknown error'}`, 
        indicator: 'red' 
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddNode = useCallback((newNode) => {
    isDirtyRef.current = true
    setNodes((nds) => [...nds, newNode])
  }, [])

  // Expose addNode to parent via ref
  useImperativeHandle(ref, () => ({
    addNode: handleAddNode
  }), [handleAddNode])

  const handleUpdateNode = (nodeId, updates) => {
    isDirtyRef.current = true
    setNodes((nds) => 
      nds.map((n) => 
        n.id === nodeId 
          ? { ...n, data: { ...n.data, ...updates } } 
          : n
      )
    )
  }

  const handleDeleteNode = (nodeId) => {
    isDirtyRef.current = true
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setSelectedNodeId(null)
  }

  return (
    <div style={{ 
      height: '600px', 
      border: '1px solid #e5e7eb', 
      borderRadius: '8px',
      position: 'relative',
      overflow: 'hidden'
    }}>
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
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        attributionPosition="bottom-left"
      >
        <Background 
          variant="dots" 
          gap={15} 
          size={1} 
          color="#d1d5db"
        />
        <Controls 
          showInteractive={false}
          position="bottom-right"
        />
        <MiniMap 
          nodeColor={(node) => {
            if (node.data?.status === 'Occupied') return '#f44336'
            if (node.data?.status === 'Reserved') return '#ff9800'
            if (node.data?.status === 'Cleaning') return '#2196f3'
            return '#4caf50'
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
          position="top-right"
          style={{
            background: 'white',
            border: '1px solid #e5e7eb'
          }}
        />
        <Panel position="top-left">
          <div style={{
            background: 'white',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            fontSize: '0.875rem',
            fontWeight: '600'
          }}>
            {floor ? `Floor: ${floor}` : 'No floor selected'}
          </div>
        </Panel>
        <Panel position="top-center">
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="btn-success"
            style={{
              background: isSaving ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span>{isSaving ? '⏳' : '💾'}</span>
            {isSaving ? 'Saving...' : 'Save Layout'}
          </button>
        </Panel>
      </ReactFlow>
      
      {selectedNode && (
        <PropertiesPanel 
          node={selectedNode}
          floor={floor}
          onUpdate={(updates) => handleUpdateNode(selectedNode.id, updates)}
          onDelete={() => handleDeleteNode(selectedNode.id)}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  )
})
