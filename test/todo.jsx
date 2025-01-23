import React, { useState, useEffect, useRef } from 'react';
import Dexie from 'dexie';
import { 
  Trash2, 
  Check, 
  FileText, 
  Download, 
  PlusCircle 
} from 'lucide-react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  Button, 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  Input, 
  Textarea 
} from '@/components/ui/';

// Dexie Database Setup
class TodoDatabase extends Dexie {
  constructor() {
    super('TodoDatabase');
    this.version(1).stores({
      tasks: '++id, title, description, dueDate, completed'
    });
  }
}

const db = new TodoDatabase();

const TodoApp = () => {
  const [tasks, setTasks] = useState([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    dueDate: '',
    attachments: [],
    completed: false
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadTasks = async () => {
      const fetchedTasks = await db.tasks
        .orderBy('dueDate')
        .toArray();
      
      // Custom sorting logic
      const sortedTasks = fetchedTasks.sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate) - new Date(b.dueDate);
        }
        if (!a.dueDate && !b.dueDate) {
          return a.completed - b.completed;
        }
        return a.completed - b.completed;
      });

      setTasks(sortedTasks);
    };

    loadTasks();
  }, []);

  const handleCreateTask = async () => {
    const taskId = await db.tasks.add({
      ...newTask,
      attachments: newTask.attachments
    });

    const updatedTasks = await db.tasks
      .orderBy('dueDate')
      .toArray();
    
    setTasks(updatedTasks);
    setIsCreateDialogOpen(false);
    setNewTask({
      title: '',
      description: '',
      dueDate: '',
      attachments: [],
      completed: false
    });
  };

  const handleDeleteTask = async (taskId) => {
    await db.tasks.delete(taskId);
    const updatedTasks = await db.tasks
      .orderBy('dueDate')
      .toArray();
    setTasks(updatedTasks);
  };

  const handleToggleComplete = async (task) => {
    await db.tasks.update(task.id, { 
      completed: !task.completed 
    });
    
    const updatedTasks = await db.tasks
      .orderBy('dueDate')
      .toArray();
    setTasks(updatedTasks);
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files);
    const filePromises = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({
          name: file.name,
          type: file.type,
          data: e.target.result
        });
        reader.readAsDataURL(file);
      });
    });

    Promise.all(filePromises).then((attachments) => {
      setNewTask(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...attachments]
      }));
    });
  };

  const handleDownloadAttachment = (attachment) => {
    const link = document.createElement('a');
    link.href = attachment.data;
    link.download = attachment.name;
    link.click();
  };

  // Rest of the component remains the same as previous implementation
  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            Todo List
            <Button 
              onClick={() => setIsCreateDialogOpen(true)} 
              className="flex items-center gap-2"
            >
              <PlusCircle /> Create Task
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.map((task) => (
            <div 
              key={task.id} 
              className={`
                flex items-center p-3 border-b 
                ${task.completed ? 'opacity-50 bg-gray-100' : 'bg-white'}
                transition-all duration-300
              `}
            >
              <div className="flex-grow">
                <div className="font-bold">{task.title}</div>
                {task.description && (
                  <div className="text-sm text-gray-600">{task.description}</div>
                )}
                {task.dueDate && (
                  <div className="text-xs text-gray-500">
                    Due: {new Date(task.dueDate).toLocaleDateString()}
                  </div>
                )}
                {task.attachments && task.attachments.length > 0 && (
                  <div className="flex gap-2 mt-1">
                    {task.attachments.map((attachment, index) => (
                      <Button 
                        key={index} 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDownloadAttachment(attachment)}
                      >
                        <FileText className="mr-2 h-4 w-4" /> 
                        <Download className="h-4 w-4" />
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => handleToggleComplete(task)}
                >
                  <Check className={task.completed ? 'text-green-500' : 'text-gray-300'} />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => handleDeleteTask(task.id)}
                >
                  <Trash2 className="text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dialog remains the same as previous implementation */}
      <Dialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <Input 
              placeholder="Task Title" 
              value={newTask.title}
              onChange={(e) => setNewTask(prev => ({
                ...prev, 
                title: e.target.value
              }))}
            />
            
            <Textarea 
              placeholder="Description (Optional)" 
              value={newTask.description}
              onChange={(e) => setNewTask(prev => ({
                ...prev, 
                description: e.target.value
              }))}
            />
            
            <Input 
              type="date" 
              value={newTask.dueDate}
              onChange={(e) => setNewTask(prev => ({
                ...prev, 
                dueDate: e.target.value
              }))}
            />
            
            <input 
              type="file" 
              multiple 
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            
            <Button 
              variant="outline"
              onClick={() => fileInputRef.current.click()}
            >
              Upload Attachments
            </Button>
            
            {newTask.attachments.map((attachment, index) => (
              <div key={index} className="flex items-center">
                {attachment.name}
              </div>
            ))}
            
            <Button 
              onClick={handleCreateTask} 
              disabled={!newTask.title}
            >
              Create Task
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TodoApp;
