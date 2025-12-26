import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useSpring } from 'framer-motion';
import { Upload, Image as ImageIcon, Loader2, Brain, Sparkles, Zap, ChevronRight, Trophy, Star, Info, Camera, FileImage, FileType, HardDrive, Clock, FileText, Grid, Layers, Database, Plus, Mail, Send, Check, Edit, Trash, X, RotateCcw, RotateCw, ZoomIn, ZoomOut, Crop, Save, Trash2, Download, RefreshCw } from 'lucide-react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import confetti from 'canvas-confetti';
import './AIPage.css';
import { toast } from 'react-hot-toast';

const AIPage = () => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [editingImage, setEditingImage] = useState(null);
  const [imageEditor, setImageEditor] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropBox, setCropBox] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    aspectRatio: 1
  });
  const [cropStart, setCropStart] = useState(null);
  const [cropResizeHandle, setCropResizeHandle] = useState(null);
  const [cropDragStart, setCropDragStart] = useState(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [cropMode, setCropMode] = useState('free');
  const [batchPredictions, setBatchPredictions] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const particlesRef = useRef([]);
  const mousePosition = useRef({ x: 0, y: 0 });
  const [imageInfo, setImageInfo] = useState(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownNumber, setCountdownNumber] = useState(3);
  const [showSupportedClasses, setShowSupportedClasses] = useState(false);
  const [supportedClasses, setSupportedClasses] = useState([]);
  const [modelInfo, setModelInfo] = useState(null);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [showRequestClass, setShowRequestClass] = useState(false);
  const [requestForm, setRequestForm] = useState({
    name: '',
    email: '',
    class_name: '',
    description: '',
    examples: ''
  });
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [contactEmail, setContactEmail] = useState('');
  const [showBatchResults, setShowBatchResults] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [showAddClassification, setShowAddClassification] = useState(false);
  const [newClassification, setNewClassification] = useState({
    class_name: '',
    description: '',
    examples: []
  });
  const imageEditorRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const [batchResultsBlob, setBatchResultsBlob] = useState(null);

  const resetClassification = () => {
    setSelectedFiles([]);
    setPreviews([]);
    setPredictions(null);
    setError(null);
    setLoading(false);
    setBatchLoading(false);
    setShowBatchResults(false);
    setBatchResultsBlob(null);
    setImageInfo(null);
    setShowCountdown(false);
    setCountdownNumber(3);
    
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const fallbackClasses = [
    {
      name: "bear",
      display_name: "Bear",
      icon: "🐻",
      description: "Different species of bears",
      examples: ["Brown bear", "Black bear", "Polar bear"]
    },
    {
      name: "butterfly",
      display_name: "Butterfly",
      icon: "🦋",
      description: "Various species of butterflies",
      examples: ["Monarch", "Swallowtail", "Blue morpho"]
    },
    {
      name: "camel",
      display_name: "Camel",
      icon: "🐪",
      description: "Different types of camels",
      examples: ["Dromedary", "Bactrian", "Wild camel"]
    },
    {
      name: "capybara",
      display_name: "Capybara",
      icon: "🦫",
      description: "The world's largest rodent",
      examples: ["Capybara", "Giant capybara"]
    },
    {
      name: "cat",
      display_name: "Cat",
      icon: "🐱",
      description: "Various breeds of domestic cats",
      examples: ["Persian", "Siamese", "Maine Coon"]
    },
    {
      name: "chicken",
      display_name: "Chicken",
      icon: "🐔",
      description: "Different breeds of chickens",
      examples: ["Leghorn", "Rhode Island Red", "Plymouth Rock"]
    },
    {
      name: "cow",
      display_name: "Cow",
      icon: "🐄",
      description: "Various breeds of cattle",
      examples: ["Holstein", "Jersey", "Angus"]
    },
    {
      name: "dog",
      display_name: "Dog",
      icon: "🐕",
      description: "Different breeds of dogs",
      examples: ["Labrador", "German Shepherd", "Golden Retriever"]
    },
    {
      name: "elephant",
      display_name: "Elephant",
      icon: "🐘",
      description: "Different species of elephants",
      examples: ["African elephant", "Asian elephant"]
    },
    {
      name: "horse",
      display_name: "Horse",
      icon: "🐎",
      description: "Various breeds of horses",
      examples: ["Arabian", "Thoroughbred", "Mustang"]
    },
    {
      name: "sheep",
      display_name: "Sheep",
      icon: "🐑",
      description: "Different breeds of sheep",
      examples: ["Merino", "Suffolk", "Hampshire"]
    },
    {
      name: "spider",
      display_name: "Spider",
      icon: "🕷️",
      description: "Various species of spiders",
      examples: ["Tarantula", "Black widow", "Wolf spider"]
    },
    {
      name: "squirrel",
      display_name: "Squirrel",
      icon: "🐿️",
      description: "Different types of squirrels",
      examples: ["Gray squirrel", "Red squirrel", "Flying squirrel"]
    }
  ];

  const fallbackModelInfo = {
    name: "Image Classification Model",
    version: "1.0",
    last_updated: "2024-03-28",
    accuracy: "95%",
    supported_formats: ["jpg", "jpeg", "png", "bmp"]
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    let scene, camera, renderer, particles;
    let animationFrameId;

    try {
      scene = new THREE.Scene();
      sceneRef.current = scene;
  
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.z = 5;
      cameraRef.current = camera;

      renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
      });
      
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      rendererRef.current = renderer;

      const particleGeometry = new THREE.BufferGeometry();
      const particleCount = 1000;
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 10;
        positions[i + 1] = (Math.random() - 0.5) * 10;
        positions[i + 2] = (Math.random() - 0.5) * 10;

        colors[i] = Math.random() * 0.5 + 0.5;
        colors[i + 1] = Math.random() * 0.5 + 0.5;
        colors[i + 2] = Math.random() * 0.5 + 0.5;
      }

      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const particleMaterial = new THREE.PointsMaterial({
        size: 0.02,
        vertexColors: true,
        transparent: true,
        opacity: 0.8
      });

      particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);
      particlesRef.current = particles;

      const handleMouseMove = (event) => {
        mousePosition.current = {
          x: (event.clientX / window.innerWidth) * 2 - 1,
          y: -(event.clientY / window.innerHeight) * 2 + 1
        };
      };

      window.addEventListener('mousemove', handleMouseMove);

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);

        if (particles) {
          particles.rotation.x += 0.0005;
          particles.rotation.y += 0.0005;

          particles.rotation.x += mousePosition.current.y * 0.0001;
          particles.rotation.y += mousePosition.current.x * 0.0001;
        }

        if (renderer && scene && camera) {
          renderer.render(scene, camera);
        }
      };

      animate();

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        if (renderer) {
          renderer.dispose();
        }
        if (particleGeometry) {
          particleGeometry.dispose();
        }
        if (particleMaterial) {
          particleMaterial.dispose();
        }
      };
    } catch (error) {
      console.error('Error in Three.js setup:', error);
      if (renderer) {
        renderer.dispose();
      }
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;

      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const triggerConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
    }, 250);
  };

  useEffect(() => {
    if (predictions && particlesRef.current) {
      triggerConfetti();

      gsap.to(particlesRef.current.rotation, {
        x: Math.PI * 2,
        y: Math.PI * 2,
        duration: 2,
        ease: "power2.inOut"
      });

      const positions = particlesRef.current.geometry.attributes.position.array;
      const originalPositions = [...positions];
      
      gsap.to(positions, {
        duration: 1,
        ease: "power2.out",
        onUpdate: () => {
          for (let i = 0; i < positions.length; i += 3) {
            positions[i] = originalPositions[i] + (Math.random() - 0.5) * 0.5;
            positions[i + 1] = originalPositions[i + 1] + (Math.random() - 0.5) * 0.5;
            positions[i + 2] = originalPositions[i + 2] + (Math.random() - 0.5) * 0.5;
          }
          particlesRef.current.geometry.attributes.position.needsUpdate = true;
        }
      });
    }
  }, [predictions]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );
    
    if (files.length > 0) {
      handleMultipleFiles(files);
    }
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files).filter(file => 
      file.type.startsWith('image/')
    );
    
    if (files.length > 0) {
      handleMultipleFiles(files);
    }
  };

  const handleMultipleFiles = (files) => {
    const newFiles = [...selectedFiles, ...files];
    setSelectedFiles(newFiles);

    const newPreviews = files.map(file => ({
      url: URL.createObjectURL(file),
      file: file,
      name: file.name
    }));
    setPreviews([...previews, ...newPreviews]);
  };

  const handleBatchUpload = async () => {
    if (!selectedFiles.length) return;
    
    setLoading(true);
    setBatchLoading(true);
    setShowBatchResults(true);
    
    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files[]', file);
      });

      const response = await fetch('http://localhost:5001/api/predict-batch', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process batch images');
      }

      const blob = await response.blob();
      setBatchResultsBlob(blob);
      
      toast.success('Batch classification completed! Click the download button to get your results.');
      
    } catch (error) {
      console.error('Error in batch prediction:', error);
      toast.error(error.message || 'Failed to process batch images');
    } finally {
      setLoading(false);
      setBatchLoading(false);
    }
};

  const handleDownloadResults = () => {
    if (!batchResultsBlob) return;
    
    const url = window.URL.createObjectURL(batchResultsBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `classification_results_${new Date().toISOString().slice(0,19).replace(/[:]/g, '')}.docx`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.URL.revokeObjectURL(url);
};

  const removeFile = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    setPreviews(newPreviews);
  };

  const startImageEdit = (e, preview) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingImage(preview);
    setImageEditor({
      rotation: 0,
      scale: 1,
      position: { x: 0, y: 0 }
    });
  };

  const handleRotate = (direction) => {
    setImageEditor(prev => ({
      ...prev,
      rotation: prev.rotation + (direction === 'left' ? -90 : 90)
    }));
  };

  const handleZoom = (direction) => {
    setImageEditor(prev => ({
      ...prev,
      scale: direction === 'in' ? prev.scale * 1.1 : prev.scale * 0.9
    }));
  };

  const handleDragStart = (e) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...imageEditor.position };
    
    const handleDrag = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setImageEditor(prev => ({
        ...prev,
        position: {
          x: startPos.x + dx,
          y: startPos.y + dy
        }
      }));
    };
    
    const handleDragEnd = () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
    };
    
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
  };

  const saveEdit = () => {
    if (editingImage) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        
        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.rotate((imageEditor.rotation * Math.PI) / 180);
        ctx.scale(imageEditor.scale, imageEditor.scale);
        ctx.translate(-canvas.width/2 + imageEditor.position.x, -canvas.height/2 + imageEditor.position.y);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
        
        canvas.toBlob((blob) => {
          const editedFile = new File([blob], editingImage.file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });

          const newUrl = canvas.toDataURL('image/jpeg', 0.95);
          
          setSelectedFiles(prev => prev.map(file => 
            file.name === editingImage.file.name ? editedFile : file
          ));
          
          setPreviews(prev => prev.map(p => 
            p.name === editingImage.name ? { ...p, url: newUrl, file: editedFile } : p
          ));

          setEditingImage(null);
          setImageEditor(null);
          
          if (selectedFiles.length === 1) {
            setPredictions(null);
          }
        }, 'image/jpeg', 0.95);
      };
      
      img.src = editingImage.url;
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFiles([file]);
      setPreviews([{
        url: URL.createObjectURL(file),
        file: file,
        name: file.name
      }]);
      setPredictions(null);
      setError(null);
      
      const img = new Image();
      img.onload = () => {
        setImageInfo({
          width: img.width,
          height: img.height,
          type: file.type,
          size: (file.size / 1024).toFixed(2) + ' KB'
        });
      };
      img.src = URL.createObjectURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('file', file));

    try {
      const response = await fetch('http://localhost:5001/api/predict', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process image');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to process image');
      }

      setShowCountdown(true);
      setCountdownNumber(3);
      
      const countdownInterval = setInterval(() => {
        setCountdownNumber(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            setShowCountdown(false);
            const formattedPredictions = data.predictions.map(pred => ({
              class_name: pred.class_name,
              probability: pred.probability,
              rank: pred.rank,
              class_id: pred.class_id
            }));
            setPredictions(formattedPredictions);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      setError(err.message);
      toast.error(err.message || 'Failed to process image');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getClassIcon = (className) => {
    const iconMap = {
      'avocado': '🥑',
      'backpack': '🎒',
      'bananas': '🍌',
      'bar_soap': '🧼',
      'baseball_caps': '🧢',
      'beauty_blender': '💄',
      'belts': '👔',
      'bike_helmets': '⛑️',
      'light_bulb': '💡',
      'metal_spoons': '🥄',
      'orange': '🍊',
      'peach': '🍑',
      'pillows': '🛏️',
      'pineapple': '🍍',
      'powerbank': '🔋',
      'pressure_cooker': '🍳',
      'tv_remote': '📺',
      'tennis_racket': '🎾',
      'tomato': '🍅',
      'toothpaste': '🦷',
      'tweezers': '✂️',
      'watch': '⌚',
      'watermelon': '🍉',
      'wireless_mouse': '🖱️',
      'bluetooth_speaker': '🔊',
      'boxing_gloves': '🥊',
      'charging_cable': '🔌',
      'cotton_swabs': '🧻',
      'cucumbers': '🥒'
    };
    return iconMap[className.toLowerCase()] || '🔍';
  };

  useEffect(() => {
    const fetchSupportedClasses = async () => {
      try {
        setLoadingClasses(true);

        setSupportedClasses(fallbackClasses);
        setModelInfo(fallbackModelInfo);
      } catch (error) {
        console.error('Error fetching supported classes:', error);
        setSupportedClasses(fallbackClasses);
        setModelInfo(fallbackModelInfo);
      } finally {
        setLoadingClasses(false);
      }
    };

    fetchSupportedClasses();
  }, []);


  useEffect(() => {
    const fetchContactEmail = async () => {
      try {

        setContactEmail('tonyboutros123987@gmail.com');
      } catch (error) {
        console.error('Error fetching contact email:', error);
        setContactEmail('tonando2004@gmail.com'); 
      }
    };

    fetchContactEmail();
  }, []);

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setRequestLoading(true);
    setRequestError(null);

    try {

      if (!requestForm.name || !requestForm.email || !requestForm.class_name || !requestForm.description || !requestForm.examples) {
        throw new Error('Please fill in all required fields');
      }


      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(requestForm.email)) {
        throw new Error('Please enter a valid email address');
      }

      const formData = {
        name: requestForm.name.trim(),
        email: requestForm.email.trim(),
        class_name: requestForm.class_name.trim(),
        description: requestForm.description.trim(),
        examples: requestForm.examples.trim()
      };

      const response = await fetch('http://localhost:5001/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send request');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to send request');
      }

      setRequestSuccess(true);
      setRequestForm({
        name: '',
        email: '',
        class_name: '',
        description: '',
        examples: ''
      });

      setTimeout(() => {
        setRequestSuccess(false);
        setShowRequestClass(false);
      }, 3000);

      toast.success('Your request has been sent successfully!');

    } catch (error) {
      console.error('Error submitting request:', error);
      setRequestError(error.message || 'Failed to send request. Please try again.');
      toast.error(error.message || 'Failed to send request. Please try again.');
    } finally {
      setRequestLoading(false);
    }
  };

  const startCrop = () => {
    setIsCropping(true);
    setCropMode('free');
    const rect = imageEditorRef.current.getBoundingClientRect();
    const img = imageEditorRef.current.querySelector('img');
    const imgRect = img.getBoundingClientRect();
    
    // Initialize crop box to 80% of image size
    const width = imgRect.width * 0.8;
    const height = imgRect.height * 0.8;
    const x = (imgRect.width - width) / 2;
    const y = (imgRect.height - height) / 2;
    
    setCropBox({
      x,
      y,
      width,
      height,
      aspectRatio: width / height
    });
  };

  const handleCropMouseDown = (e) => {
    if (!isCropping) return;
    
    const rect = imageEditorRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const handle = getResizeHandle(x, y);
    if (handle) {
      setIsResizing(true);
      setCropResizeHandle(handle);
      setCropStart({ x, y });
      return;
    }

    if (isPointInCropBox(x, y)) {
      setIsDraggingCrop(true);
      setCropDragStart({ x, y });
      return;
    }

    setCropStart({ x, y });
    
    const handleMouseMove = (e) => {
      if (!cropStart) return;
      
      const newX = e.clientX - rect.left;
      const newY = e.clientY - rect.top;
      
      let width = newX - cropStart.x;
      let height = newY - cropStart.y;
      
      if (cropMode !== 'free') {
        const ratio = getAspectRatio(cropMode);
        if (Math.abs(width) > Math.abs(height)) {
          height = width / ratio;
        } else {
          width = height * ratio;
        }
      }
      
      setCropBox(prev => ({
        ...prev,
        x: cropStart.x,
        y: cropStart.y,
        width,
        height,
        aspectRatio: Math.abs(width / height)
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setCropStart(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const getResizeHandle = (x, y) => {
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const handleSize = 12;
    
    for (const handle of handles) {
      const handlePos = getHandlePosition(handle);
      const distance = Math.sqrt(
        Math.pow(x - handlePos.x, 2) + Math.pow(y - handlePos.y, 2)
      );
      
      if (distance <= handleSize) {
        return handle;
      }
    }
    
    return null;
  };

  const getHandlePosition = (handle) => {
    const { x, y, width, height } = cropBox;
    
    switch (handle) {
      case 'nw': return { x, y };
      case 'n': return { x: x + width / 2, y };
      case 'ne': return { x: x + width, y };
      case 'e': return { x: x + width, y: y + height / 2 };
      case 'se': return { x: x + width, y: y + height };
      case 's': return { x: x + width / 2, y: y + height };
      case 'sw': return { x, y: y + height };
      case 'w': return { x, y: y + height / 2 };
      default: return { x: 0, y: 0 };
    }
  };

  const isPointInCropBox = (x, y) => {
    const { x: boxX, y: boxY, width, height } = cropBox;
    return (
      x >= boxX &&
      x <= boxX + width &&
      y >= boxY &&
      y <= boxY + height
    );
  };

  const getAspectRatio = (mode) => {
    switch (mode) {
      case 'square': return 1;
      case '16:9': return 16 / 9;
      case '4:3': return 4 / 3;
      default: return null;
    }
  };

  const handleResize = (e) => {
    if (!isResizing || !cropResizeHandle || !cropStart) return;
    
    const rect = imageEditorRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const dx = x - cropStart.x;
    const dy = y - cropStart.y;
    
    let newCropBox = { ...cropBox };
    
    switch (cropResizeHandle) {
      case 'nw':
        newCropBox.width -= dx;
        newCropBox.height -= dy;
        newCropBox.x += dx;
        newCropBox.y += dy;
        break;
      case 'n':
        newCropBox.height -= dy;
        newCropBox.y += dy;
        break;
      case 'ne':
        newCropBox.width += dx;
        newCropBox.height -= dy;
        newCropBox.y += dy;
        break;
      case 'e':
        newCropBox.width += dx;
        break;
      case 'se':
        newCropBox.width += dx;
        newCropBox.height += dy;
        break;
      case 's':
        newCropBox.height += dy;
        break;
      case 'sw':
        newCropBox.width -= dx;
        newCropBox.height += dy;
        newCropBox.x += dx;
        break;
      case 'w':
        newCropBox.width -= dx;
        newCropBox.x += dx;
        break;
    }
    
    if (cropMode !== 'free') {
      const ratio = getAspectRatio(cropMode);
      if (Math.abs(newCropBox.width) > Math.abs(newCropBox.height)) {
        newCropBox.height = newCropBox.width / ratio;
      } else {
        newCropBox.width = newCropBox.height * ratio;
      }
    }
    
    setCropBox(newCropBox);
    setCropStart({ x, y });
  };

  const handleDragCrop = (e) => {
    if (!isDraggingCrop || !cropDragStart) return;
    
    const rect = imageEditorRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - cropDragStart.x;
    const dy = y - cropDragStart.y;
    
    setCropBox(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy
    }));
    
    setCropDragStart({ x, y });
  };

  const applyCrop = () => {
    if (!editingImage || !cropBox) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {

      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;


      const displayRect = imageEditorRef.current.getBoundingClientRect();
      const imgElement = imageEditorRef.current.querySelector('img');
      const imgRect = imgElement.getBoundingClientRect();


      const scaleX = imgWidth / imgRect.width;
      const scaleY = imgHeight / imgRect.height;

      const cropX = Math.min(cropBox.x, cropBox.x + cropBox.width);
      const cropY = Math.min(cropBox.y, cropBox.y + cropBox.height);
      const cropWidth = Math.abs(cropBox.width);
      const cropHeight = Math.abs(cropBox.height);

      const actualCropX = (cropX - imgRect.left + displayRect.left) * scaleX;
      const actualCropY = (cropY - imgRect.top + displayRect.top) * scaleY;
      const actualCropWidth = cropWidth * scaleX;
      const actualCropHeight = cropHeight * scaleY;

      canvas.width = actualCropWidth;
      canvas.height = actualCropHeight;

      ctx.drawImage(
        img,
        actualCropX,
        actualCropY,
        actualCropWidth,
        actualCropHeight,
        0,
        0,
        actualCropWidth,
        actualCropHeight
      );

      canvas.toBlob((blob) => {
        const croppedFile = new File([blob], editingImage.file.name, {
          type: 'image/jpeg',
          lastModified: Date.now()
        });

        setSelectedFiles(prev => prev.map(file => 
          file.name === editingImage.file.name ? croppedFile : file
        ));
        
        setPreviews(prev => prev.map(p => 
          p.name === editingImage.name ? { ...p, url: canvas.toDataURL('image/jpeg', 0.95), file: croppedFile } : p
        ));

        setEditingImage(null);
        setImageEditor(null);
        setIsCropping(false);
        setCropBox(null);
      

        if (selectedFiles.length === 1) {
          setPredictions(null);
        }
      }, 'image/jpeg', 0.95);
    };

    img.src = editingImage.url;
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', () => {
        setIsResizing(false);
        setCropResizeHandle(null);
        setCropStart(null);
      });
    }
    
    if (isDraggingCrop) {
      document.addEventListener('mousemove', handleDragCrop);
      document.addEventListener('mouseup', () => {
        setIsDraggingCrop(false);
        setCropDragStart(null);
      });
    }
    
    return () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', () => {
        setIsResizing(false);
        setCropResizeHandle(null);
        setCropStart(null);
      });
      document.removeEventListener('mousemove', handleDragCrop);
      document.removeEventListener('mouseup', () => {
        setIsDraggingCrop(false);
        setCropDragStart(null);
      });
    };
  }, [isResizing, isDraggingCrop]);

  const handleReset = () => {
    if (editingImage) {
      // Create a new image element to get the original dimensions
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas to original image dimensions
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw the original image
        ctx.drawImage(img, 0, 0);
        
        // Convert canvas to blob
        canvas.toBlob((blob) => {
          // Create a new File object from the blob
          const originalFile = new File([blob], editingImage.file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });

          // Create a new URL for the preview
          const newUrl = canvas.toDataURL('image/jpeg', 0.95);
          
          // Update only the specific file that was edited
          setSelectedFiles(prev => prev.map(file => 
            file.name === editingImage.file.name ? originalFile : file
          ));
          
          // Update only the specific preview that was edited
          setPreviews(prev => prev.map(p => 
            p.name === editingImage.name ? { ...p, url: newUrl, file: originalFile } : p
          ));

          // Reset the image editor state
          setImageEditor({
            rotation: 0,
            scale: 1,
            position: { x: 0, y: 0 }
          });
          
          // Reset crop state if active
          if (isCropping) {
            setIsCropping(false);
            setCropBox(null);
          }
          
          // Only clear predictions if we're editing a single image
          if (selectedFiles.length === 1) {
            setPredictions(null);
          }
        }, 'image/jpeg', 0.95);
      };
      
      // Load the original image
      img.src = editingImage.url;
    }
  };

  const handleAddClassification = () => {
    setShowAddClassification(true);
  };

  const handleSaveClassification = async () => {
    try {
      // Here you would typically make an API call to save the new classification
      // For now, we'll just update the local state
      const updatedClasses = [...supportedClasses, {
        name: newClassification.class_name.toLowerCase().replace(/\s+/g, '_'),
        display_name: newClassification.class_name,
        description: newClassification.description,
        examples: Array.isArray(newClassification.examples) 
          ? newClassification.examples 
          : newClassification.examples.split(',').map(e => e.trim()),
        icon: '📦' // Default icon
      }];
      
      setSupportedClasses(updatedClasses);
      setShowAddClassification(false);
      setNewClassification({
        class_name: '',
        description: '',
        examples: ''
      });
      
      toast.success('New classification added successfully!');
    } catch (error) {
      toast.error('Failed to add new classification');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#040D21] via-[#0D1B3E] to-[#162447] relative overflow-hidden">
      {/* Three.js Canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full z-0"
        style={{ opacity: 0.5 }}
      />

      {/* Progress bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-purple-600 z-50"
        style={{ scaleX, transformOrigin: "0%" }}
      />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute w-full h-full">
          <motion.div 
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl parallax"
            data-speed="0.05"
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 90, 0],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              ease: "linear"
            }}
          />
          <motion.div 
            className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl parallax"
            data-speed="0.08"
            animate={{
              scale: [1.2, 1, 1.2],
              rotate: [90, 0, 90],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              ease: "linear"
            }}
          />
          <motion.div 
            className="absolute top-3/4 left-1/2 w-64 h-64 bg-indigo-400/10 rounded-full blur-3xl parallax"
            data-speed="0.1"
            animate={{
              scale: [1, 1.3, 1],
              rotate: [0, -90, 0],
              opacity: [0.1, 0.15, 0.1]
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        </div>
      </div>

      {/* Animated grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      {/* Main Content */}
      <div className="container mx-auto px-4 pt-24 pb-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-12"
          >
            <motion.div
              animate={{
                rotate: [0, 360],
                scale: [1, 1.1, 1]
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "linear"
              }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 mb-6"
            >
              <Brain className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
              Image Classification
            </h1>
            <p className="text-gray-300 text-lg mb-6">
              Upload an image and let our AI analyze it for you
            </p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex justify-center gap-4 text-sm text-gray-400"
            >
              <span className="flex items-center">
                <Camera className="w-4 h-4 mr-1" />
                Supports JPG, PNG, JPEG
              </span>
              <span className="flex items-center">
                <HardDrive className="w-4 h-4 mr-1" />
                Max 16MB per image
              </span>
              <span className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                Results in seconds
              </span>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/10 backdrop-blur-lg rounded-xl p-8 shadow-xl border border-white/10"
          >
            <div className="mb-6 text-sm text-gray-300">
              <p className="flex items-center mb-3">
                <Upload className="w-5 h-5 mr-2 text-blue-400" />
                Upload one or multiple images
              </p>
              <p className="flex items-center mb-3">
                <Edit className="w-5 h-5 mr-2 text-purple-400" />
                Edit images before classification
              </p>
              <p className="flex items-center">
                <Crop className="w-5 h-5 mr-2 text-indigo-400" />
                Crop, rotate, and adjust images
              </p>
            </div>
            
            <div 
              className={`upload-area ${isDragging ? 'dragging' : ''} mb-8`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input').click()}
            >
              <div className="upload-content">
                <Upload className="upload-icon text-blue-400" />
                <p className="text-xl font-medium mb-3 text-white">Drag and drop images here or click to select</p>
                <p className="text-sm text-gray-400">You can upload multiple images at once</p>
                <input
                  id="file-input"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInput}
                  className="file-input"
                />
              </div>
            </div>

            {previews.length > 0 && (
              <div className="preview-grid mb-8">
                {previews.map((preview, index) => (
                  <div key={index} className="preview-item">
                    <img src={preview.url} alt={preview.name} />
                    <div className="preview-actions">
                      <button 
                        onClick={(e) => startImageEdit(e, preview)}
                        type="button"
                        className="hover:bg-blue-500/20 transition-colors"
                      >
                        <Edit className="icon text-blue-400" />
                        <span className="sr-only">Edit</span>
                      </button>
                      <button 
                        onClick={(e) => removeFile(e, index)}
                        type="button"
                        className="hover:bg-red-500/20 transition-colors"
                      >
                        <Trash className="icon text-red-400" />
                        <span className="sr-only">Remove</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {uploadProgress > 0 && (
              <div className="progress-bar mb-6">
                <div 
                  className="progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            <div className="ai-upload-actions space-y-4">
              {selectedFiles.length === 1 ? (
                <form onSubmit={handleSubmit}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={selectedFiles.length === 0 || loading}
                    className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white py-5 rounded-xl font-semibold hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center relative overflow-hidden group shadow-lg shadow-blue-500/20"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                    <span className="relative z-10 flex items-center text-lg">
                      {loading ? (
                        <>
                          <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-6 h-6 mr-3" />
                          Classify Image
                        </>
                      )}
                    </span>
                  </motion.button>
                </form>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleBatchUpload}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white py-5 rounded-xl font-semibold hover:from-purple-700 hover:via-indigo-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center relative overflow-hidden group shadow-lg shadow-purple-500/20"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400/20 to-indigo-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                  <span className="relative z-10 flex items-center text-lg">
                    {loading ? (
                      <>
                        <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Grid className="w-6 h-6 mr-3" />
                        Batch Classify
                      </>
                    )}
                  </span>
                </motion.button>
              )}
            </div>
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-500 flex items-center"
              >
                <Zap className="w-5 h-5 mr-2" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {predictions && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
              >
                <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center"
                      >
                        <Brain className="w-6 h-6 text-white" />
                      </motion.div>
                      <div>
                        <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                          Classification Results
                        </h3>
                        <p className="text-sm text-gray-400">AI-powered image analysis complete</p>
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={resetClassification}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      <RefreshCw className="w-4 h-4" />
                      New Analysis
                    </motion.button>
                  </div>

                  <div className="space-y-4">
                    {predictions.map((pred, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white/5 backdrop-blur-sm rounded-xl p-4 hover:bg-white/10 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 0.3 + index * 0.1 }}
                              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                index === 0 
                                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' 
                                  : 'bg-gradient-to-r from-blue-500 to-purple-500'
                              }`}
                            >
                              {index === 0 ? (
                                <Trophy className="w-5 h-5 text-white" />
                              ) : (
                                <Star className="w-5 h-5 text-white" />
                              )}
                            </motion.div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-blue-400 font-bold">#{pred.rank}</span>
                                <span className="text-white text-lg font-medium group-hover:text-blue-400 transition-colors">
                                  {pred.class_name}
                                </span>
                              </div>
                              <p className="text-sm text-gray-400">
                                {pred.probability * 100 > 90 ? 'Very confident' : 
                                 pred.probability * 100 > 70 ? 'Confident' : 
                                 pred.probability * 100 > 50 ? 'Moderately confident' : 
                                 'Low confidence'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="w-40 h-2 bg-gray-700/50 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pred.probability * 100}%` }}
                                transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 relative overflow-hidden"
                              >
                                <motion.div
                                  className="absolute inset-0 bg-white/20"
                                  animate={{
                                    x: ['-100%', '100%'],
                                  }}
                                  transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "linear",
                                    delay: 0.5 + index * 0.1
                                  }}
                                />
                              </motion.div>
                            </div>
                            <motion.span
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.8 + index * 0.1 }}
                              className="text-blue-400 font-bold text-lg"
                            >
                              {(pred.probability * 100).toFixed(1)}%
                            </motion.span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="mt-6 pt-6 border-t border-white/10"
                  >
                    <div className="flex items-center justify-between text-sm text-gray-400">
                      <div className="flex items-center space-x-4">
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          Analysis completed
                        </span>
                        <span className="flex items-center">
                          <Database className="w-4 h-4 mr-1" />
                          {predictions.length} classes detected
                        </span>
                      </div>
                      <span className="flex items-center">
                        <Info className="w-4 h-4 mr-1" />
                        Results are sorted by confidence
                      </span>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Professional Loading State */}
      <AnimatePresence>
        {showCountdown && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              {/* Animated background gradient */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl blur-3xl animate-pulse" />
              
              {/* Main content container */}
              <div className="relative bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
                <div className="flex flex-col items-center space-y-8">
                  {/* Animated brain icon with enhanced effects */}
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                      rotate: [0, 360],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "linear"
                    }}
                    className="relative"
                  >
                    {/* Outer glow ring */}
                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.5, 0.3],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-xl"
                    />
                    
                    {/* Inner glow ring */}
                    <motion.div
                      animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.5, 0.7, 0.5],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="absolute inset-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full blur-lg"
                    />
                    
                    {/* Brain icon container */}
                    <div className="relative bg-gradient-to-r from-blue-500 to-purple-500 rounded-full p-4 shadow-lg">
                      <Brain className="w-12 h-12 text-white" />
                    </div>
                  </motion.div>

                  {/* Loading text with enhanced typography */}
                  <div className="text-center space-y-3">
                    <motion.h2
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-2xl font-semibold text-white tracking-wide"
                    >
                      Analyzing Image
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-gray-400 text-sm tracking-wide"
                    >
                      Our AI is processing your image with advanced algorithms
                    </motion.p>
                  </div>

                  {/* Enhanced progress indicator */}
                  <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{
                        duration: 2,
                        ease: "easeInOut",
                        repeat: Infinity,
                        repeatType: "reverse"
                      }}
                      className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 relative overflow-hidden"
                    >
                      {/* Shimmer effect */}
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                        animate={{
                          x: ["-100%", "100%"],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "linear"
                        }}
                      />
                    </motion.div>
                  </div>

                  {/* Enhanced loading dots */}
                  <div className="flex space-x-3">
                    {[0, 1, 2].map((dot) => (
                      <motion.div
                        key={dot}
                        initial={{ opacity: 0, y: 0 }}
                        animate={{ 
                          opacity: 1,
                          y: [0, -4, 0],
                          scale: [1, 1.2, 1]
                        }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          delay: dot * 0.2,
                          ease: "easeInOut"
                        }}
                        className="w-2 h-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full shadow-lg"
                      />
                    ))}
                  </div>

                  {/* Processing status */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-xs text-gray-500 tracking-wide"
                  >
                    Processing in progress...
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed Button Layout */}
      <motion.div 
        className="fixed bottom-4 right-4 z-50 flex flex-col space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowSupportedClasses(!showSupportedClasses)}
          className="px-6 py-3 rounded-full bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white font-semibold shadow-lg hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 transition-all flex items-center space-x-3 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
          <Database className="w-5 h-5 relative z-10" />
          <span className="relative z-10">Supported Classes</span>
        </motion.button>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowRequestClass(!showRequestClass)}
          className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white font-semibold shadow-lg hover:from-purple-700 hover:via-indigo-700 hover:to-blue-700 transition-all flex items-center space-x-3 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-purple-400/20 to-indigo-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
          <Plus className="w-5 h-5 relative z-10" />
          <span className="relative z-10">Request New Class</span>
        </motion.button>
      </motion.div>

      {/* Update the Request Class Modal */}
      <AnimatePresence>
        {showRequestClass && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40"
            onClick={() => setShowRequestClass(false)}
          >
            <motion.div
              initial={{ y: 50 }}
              animate={{ y: 0 }}
              exit={{ y: 50 }}
              transition={{ duration: 0.3 }}
              className="bg-[#1a1f3c] rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Request New Class
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Help us expand our AI's capabilities
                  </p>
                </div>
                <button
                  onClick={() => setShowRequestClass(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleRequestSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Your Name
                    </label>
                    <input
                      type="text"
                      required
                      value={requestForm.name}
                      onChange={(e) => setRequestForm({ ...requestForm, name: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Your Email
                    </label>
                    <input
                      type="email"
                      required
                      value={requestForm.email}
                      onChange={(e) => setRequestForm({ ...requestForm, email: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    New Class Name
                  </label>
                  <input
                    type="text"
                    required
                    value={requestForm.class_name}
                    onChange={(e) => setRequestForm({ ...requestForm, class_name: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Dog, Cat, Bird"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    required
                    value={requestForm.description}
                    onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                    placeholder="Describe the class and its characteristics..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Examples (comma-separated)
                  </label>
                  <input
                    type="text"
                    required
                    value={requestForm.examples}
                    onChange={(e) => setRequestForm({ ...requestForm, examples: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Golden Retriever, German Shepherd, Labrador"
                  />
                </div>

                <div className="text-sm text-gray-400 flex items-center space-x-2">
                  <Mail className="w-4 h-4" />
                  <span>Your request will be sent to: {contactEmail}</span>
                </div>

                {requestError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-500"
                  >
                    Failed to send request. Please try again.
                  </motion.div>
                )}

                {requestSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-green-500/20 border border-green-500 rounded-lg text-green-500 flex items-center"
                  >
                    <Check className="w-5 h-5 mr-2" />
                    Request sent successfully! We'll review it soon.
                  </motion.div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={requestLoading}
                  className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white py-4 rounded-xl font-semibold hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3 relative overflow-hidden group shadow-lg shadow-blue-500/20"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                  {requestLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                      <span className="relative z-10">Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 relative z-10" />
                      <span className="relative z-10">Send Request</span>
                    </>
                  )}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Supported Classes Modal */}
      <AnimatePresence>
        {showSupportedClasses && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40"
            onClick={() => setShowSupportedClasses(false)}
          >
            <motion.div
              initial={{ y: 50 }}
              animate={{ y: 0 }}
              exit={{ y: 50 }}
              transition={{ duration: 0.3 }}
              className="bg-[#1a1f3c] rounded-2xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Supported Image Classes
                  </h2>
                  {modelInfo && (
                    <p className="text-sm text-gray-400 mt-1">
                      Model Version: {modelInfo.version} | Accuracy: {modelInfo.accuracy}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowSupportedClasses(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {loadingClasses ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {supportedClasses.map((cls, index) => (
                      <motion.div
                        key={cls.name}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-[#2a2f4c] rounded-xl p-4 hover:bg-[#3a3f5c] transition-all cursor-pointer group"
                        whileHover={{ scale: 1.02 }}
                      >
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="text-2xl">{cls.icon}</span>
                          <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                            {cls.display_name}
                          </h3>
                        </div>
                        <p className="text-gray-400 text-sm mb-3">
                          {cls.description}
                        </p>
                        <div className="text-xs text-gray-500">
                          <p className="font-medium mb-1">Examples:</p>
                          <div className="flex flex-wrap gap-2">
                            {cls.examples.map((example, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-white/5 rounded-full text-gray-400"
                              >
                                {example}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-6 text-center text-gray-400 text-sm">
                    <p>Our AI model can identify and classify these types of images with high accuracy.</p>
                    <p className="mt-2">Try uploading an image to see the classification in action!</p>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Update the edit modal */}
      {editingImage && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 max-w-4xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">Edit Image</h3>
              <button
                onClick={() => {
                  setEditingImage(null);
                  setImageEditor(null);
                  setIsCropping(false);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div 
              ref={imageEditorRef}
              className="relative aspect-square max-h-[60vh] overflow-hidden rounded-lg"
              onMouseDown={handleCropMouseDown}
            >
              <img
                src={editingImage.url}
                alt="Editing"
                className="w-full h-full object-contain"
                style={{
                  transform: `
                    translate(${imageEditor.position.x}px, ${imageEditor.position.y}px)
                    rotate(${imageEditor.rotation}deg)
                    scale(${imageEditor.scale})
                  `,
                  cursor: isCropping ? 'crosshair' : 'move',
                  transition: 'transform 0.1s ease'
                }}
                onMouseDown={!isCropping ? handleDragStart : undefined}
              />
              {isCropping && (
                <>
                  <div
                    className="absolute border-2 border-blue-500 bg-blue-500/20"
                    style={{
                      left: `${Math.min(cropBox.x, cropBox.x + cropBox.width)}px`,
                      top: `${Math.min(cropBox.y, cropBox.y + cropBox.height)}px`,
                      width: `${Math.abs(cropBox.width)}px`,
                      height: `${Math.abs(cropBox.height)}px`
                    }}
                  />
                  {/* Resize handles */}
                  {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(handle => (
                    <div
                      key={handle}
                      className={`crop-handle ${handle}`}
                      style={{
                        left: `${getHandlePosition(handle).x}px`,
                        top: `${getHandlePosition(handle).y}px`
                      }}
                    />
                  ))}
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/50" style={{
                    clipPath: `inset(${Math.min(cropBox.y, cropBox.y + cropBox.height)}px ${Math.min(cropBox.x, cropBox.x + cropBox.width)}px ${Math.max(cropBox.y, cropBox.y + cropBox.height)}px ${Math.max(cropBox.x, cropBox.x + cropBox.width)}px)`
                  }} />
                </>
              )}
            </div>
            
            <div className="flex flex-col gap-4 mt-4">
              <div className="flex justify-center gap-4">
                <button
                  onClick={startCrop}
                  className={`p-2 rounded-lg ${
                    isCropping ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <Crop className="w-6 h-6" />
                  <span className="sr-only">Crop</span>
                </button>
                {isCropping ? (
                  <>
                    <button
                      onClick={() => setCropMode('free')}
                      className={`p-2 rounded-lg ${
                        cropMode === 'free' ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      Free
                    </button>
                    <button
                      onClick={() => setCropMode('square')}
                      className={`p-2 rounded-lg ${
                        cropMode === 'square' ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      1:1
                    </button>
                    <button
                      onClick={() => setCropMode('16:9')}
                      className={`p-2 rounded-lg ${
                        cropMode === '16:9' ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      16:9
                    </button>
                    <button
                      onClick={() => setCropMode('4:3')}
                      className={`p-2 rounded-lg ${
                        cropMode === '4:3' ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      4:3
                    </button>
                    <button
                      onClick={applyCrop}
                      className="p-2 rounded-lg bg-green-500 hover:bg-green-600 text-white"
                    >
                      <Check className="w-6 h-6" />
                      <span className="sr-only">Apply</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleRotate('left')}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                    >
                      <RotateCcw className="w-6 h-6" />
                      <span className="sr-only">Rotate Left</span>
                    </button>
                    <button
                      onClick={() => handleRotate('right')}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                    >
                      <RotateCw className="w-6 h-6" />
                      <span className="sr-only">Rotate Right</span>
                    </button>
                    <button
                      onClick={() => handleZoom('in')}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                    >
                      <ZoomIn className="w-6 h-6" />
                      <span className="sr-only">Zoom In</span>
                    </button>
                    <button
                      onClick={() => handleZoom('out')}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                    >
                      <ZoomOut className="w-6 h-6" />
                      <span className="sr-only">Zoom Out</span>
                    </button>
                    <button
                      onClick={handleReset}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                      title="Reset to original"
                    >
                      <RefreshCw className="w-6 h-6" />
                    </button>
                  </>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-4 mt-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setEditingImage(null);
                  setImageEditor(null);
                  setIsCropping(false);
                }}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 text-white font-semibold hover:from-gray-700 hover:to-gray-800 transition-all flex items-center space-x-2 relative overflow-hidden group shadow-lg shadow-gray-500/20"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-gray-400/20 to-gray-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                <X className="w-5 h-5 relative z-10" />
                <span className="relative z-10">Cancel</span>
              </motion.button>
              
              {!isCropping && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={saveEdit}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white font-semibold hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 transition-all flex items-center space-x-2 relative overflow-hidden group shadow-lg shadow-blue-500/20"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                  <Save className="w-5 h-5 relative z-10" />
                  <span className="relative z-10">Save Changes</span>
                </motion.button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Update the batch results modal */}
      {showBatchResults && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 max-w-md w-full mx-4 border border-white/10 shadow-2xl"
          >
            <div className="text-center">
              {batchLoading ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">Processing Images...</h2>
                  <p className="text-gray-300 mb-6">Please wait while we analyze your images.</p>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <Check className="w-8 h-8 text-green-400" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">Classification Complete!</h2>
                  <p className="text-gray-300 mb-6">Your batch classification results are ready to download.</p>
                  
                  <div className="space-y-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleDownloadResults}
                      disabled={!batchResultsBlob}
                      className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 relative overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="relative z-10 flex items-center">
                        <Download className="w-5 h-5 mr-2" />
                        Download Results
                      </span>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setShowBatchResults(false);
                        resetClassification();
                      }}
                      className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 rounded-xl font-semibold hover:from-purple-600 hover:to-blue-600 transition-all flex items-center justify-center space-x-2 relative overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-400/20 to-blue-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="relative z-10 flex items-center">
                        <RefreshCw className="w-5 h-5 mr-2" />
                        New Classification
                      </span>
                    </motion.button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {showAddClassification && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 max-w-md w-full mx-4 border border-white/10 shadow-2xl"
          >
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-6">Add New Classification</h2>
              
              <div className="space-y-4">
                <div className="text-left">
                  <label className="block text-gray-300 mb-2">Class Name</label>
                  <input
                    type="text"
                    value={newClassification.class_name}
                    onChange={(e) => setNewClassification({...newClassification, class_name: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter class name"
                  />
                </div>
                
                <div className="text-left">
                  <label className="block text-gray-300 mb-2">Description</label>
                  <textarea
                    value={newClassification.description}
                    onChange={(e) => setNewClassification({...newClassification, description: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter description"
                    rows="3"
                  />
                </div>
                
                <div className="text-left">
                  <label className="block text-gray-300 mb-2">Examples (comma-separated)</label>
                  <input
                    type="text"
                    value={newClassification.examples}
                    onChange={(e) => setNewClassification({...newClassification, examples: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter examples separated by commas"
                  />
                </div>
              </div>
              
              <div className="flex space-x-4 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveClassification}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-600 transition-all"
                >
                  Save
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowAddClassification(false)}
                  className="flex-1 bg-gradient-to-r from-gray-500 to-gray-600 text-white py-3 rounded-xl font-semibold hover:from-gray-600 hover:to-gray-700 transition-all"
                >
                  Cancel
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AIPage; 