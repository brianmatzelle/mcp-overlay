# 🎓 Math Visualization Tools - Tutor Edition

## Overview

These MCP tools are designed for **tutors, not programmers**! You can answer student questions with beautiful Manim visualizations using natural language parameters.

## 📚 2D Visualization Tools

### 1. `plot_function` - Main Visualization Tool

**Perfect for:** "Why doesn't f(x) = 3x + 1 pass through the origin?"

```
plot_function(
    function="3x + 1",
    highlight_points="origin, y_intercept",
    show_equation=true,
    title="Understanding y-intercepts"
)
```

**Parameters:**
- `function`: Natural math notation (e.g., "3x + 1", "x^2", "sin(x)")
- `x_range`: "min,max" (default: "-5,5")
- `y_range`: "min,max" (default: "-5,5")
- `highlight_points`: Semantic points ("origin", "y_intercept", "x_intercept") or coordinates
- `show_slope`: Show rise/run for linear functions
- `show_equation`: Display the equation on graph
- `color`: BLUE, RED, GREEN, YELLOW, etc.
- `title`: Custom title text

### 2. `compare_functions` - Compare Multiple Functions

**Perfect for:** "How does 3x + 1 differ from 3x?"

```
compare_functions(
    functions="3x + 1, 3x, 2x + 1",
    labels="f(x), g(x), h(x)",
    title="Comparing Linear Functions"
)
```

### 3. `show_transformation` - Function Transformations

**Perfect for:** "What happens when we add 2 to x²?"

```
show_transformation(
    original="x^2",
    transformed="x^2 + 2",
    explain="Vertical shift up 2 units"
)
```

## 🌐 3D Visualization Tools

### 4. `plot_3d_surface` - 3D Surface Plotting

**Perfect for:** "Show me what z = x² + y² looks like in 3D!"

```
plot_3d_surface(
    function="x**2 + y**2",
    color_scheme="blue_to_red",
    title="Paraboloid Surface",
    rotation_speed=0.2
)
```

**Parameters:**
- `function`: The 3D function z = f(x,y) (e.g., "x**2 + y**2", "sin(x)*cos(y)")
- `x_range`, `y_range`, `z_range`: Axis ranges as "min,max"
- `color_scheme`: "blue_to_red", "rainbow", "cool", "warm", "green_to_yellow"
- `rotation_speed`: Camera rotation speed (0.1 = slow, 0.5 = fast)
- `show_axes`: Show 3D coordinate axes (default: true)

**Common 3D surfaces:**
- **Paraboloid** (bowl shape): `x**2 + y**2`
- **Saddle point**: `x**2 - y**2`
- **Wavy surface**: `sin(x) * cos(y)`
- **Cone**: `sqrt(x**2 + y**2)`
- **Sphere** (top half): `sqrt(9 - x**2 - y**2)`

### 5. `compare_3d_surfaces` - Compare 3D Surfaces

**Perfect for:** "What's the difference between a paraboloid and a saddle?"

```
compare_3d_surfaces(
    functions="x**2 + y**2, x**2 - y**2",
    labels="Paraboloid, Saddle Point",
    title="Comparing 3D Surfaces"
)
```

**Great for teaching:**
- Different surface types
- How coefficients affect shape
- Positive vs negative curvature

### 6. `show_3d_transformation` - 3D Transformations

**Perfect for:** "What happens when we add 2 to a paraboloid?"

```
show_3d_transformation(
    original="x**2 + y**2",
    transformed="x**2 + y**2 + 2",
    explain="Vertical shift up 2 units"
)
```

## 💡 Example Student Questions & Tool Usage

### 3D Example: "Is x² in the 3rd dimension?"

**Your response:**
```
No, x² is still in 2D! It's a curve on a flat plane. But I can show you 
what a TRUE 3D function looks like - for example, z = x² + y².

In 3D, we have three variables:
- x and y are the inputs (the floor/base)
- z is the output (height above the floor)

Let me show you a paraboloid (3D bowl shape):
```

**Tool call:**
```
plot_3d_surface(
    function="x**2 + y**2",
    title="This is a TRUE 3D surface!",
    color_scheme="rainbow"
)
```

### 3D Example: "What's a saddle point?"

**Your response:**
```
A saddle point is a 3D surface that curves up in one direction and 
down in another - like a horse saddle! The function z = x² - y² 
creates this shape.
```

**Tool call:**
```
compare_3d_surfaces(
    functions="x**2 + y**2, x**2 - y**2",
    labels="Bowl (all curves up), Saddle (curves both ways)"
)
```

## 🎯 Tips for Tutoring with 3D

1. **Start with 2D** - Make sure students understand 2D graphs before jumping to 3D
2. **Use color gradients** - The color helps students see height changes
3. **Let it rotate** - The rotation helps students understand the 3D shape
4. **Compare with 2D** - Show that z = x² (3D) is related to y = x² (2D)
5. **Use real examples** - "Imagine a bowl" for paraboloid, "like a mountain pass" for saddle

## 🔧 Advanced 3D Features

### Color Schemes

Different color schemes help emphasize different aspects:
- `"blue_to_red"` - Classic heat map (cold to hot)
- `"rainbow"` - Full spectrum (great for seeing all heights)
- `"cool"` - Blue/teal/green (calming, professional)
- `"warm"` - Yellow/orange/red (energetic, exciting)

### Camera Rotation

Control how fast the visualization spins:
- `rotation_speed=0.1` - Slow and contemplative
- `rotation_speed=0.2` - Default, comfortable
- `rotation_speed=0.4` - Fast, energetic

## 🚀 Coming Soon

- Piecewise functions
- Inequalities with shading
- Derivative visualizations
- System of equations with intersection points
- Parametric curves
- Vector fields
- Contour plots

---

**Remember:** You're a tutor, not a programmer! Focus on explaining the math, and let these tools handle the visualization details. 🎉

