// Shared Design System Configuration
tailwind.config = {
    theme: {
        extend: {
            colors: {
                'primary-green': '#2E7D32',
                'primary-dark': '#1B5E20',
                'primary-green-light': '#E8F5E9',
                'accent-orange': '#FF6D00',
                'bg-soft': '#F3F4F6',
                'bg-light': '#F8FAFC',
                'river-blue': '#0288D1',
                'text-dark': '#111827',
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            boxShadow: {
                'soft': '0 10px 40px -10px rgba(0,0,0,0.08)',
                'glow': '0 0 20px rgba(46, 125, 50, 0.3)'
            },
            backgroundImage: {
                'nature-pattern': "url('data:image/svg+xml,%3Csvg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"%232E7D32\" fill-opacity=\"0.03\" fill-rule=\"evenodd\"%3E%3Ccircle cx=\"3\" cy=\"3\" r=\"3\"/%3E%3Ccircle cx=\"13\" cy=\"13\" r=\"3\"/%3E%3C/g%3E%3C/svg%3E')",
            }
        }
    }
}
