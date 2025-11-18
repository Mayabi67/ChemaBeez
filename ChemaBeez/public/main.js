document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('order-form');
  const submitBtn = document.getElementById('submit-btn');
  const messageEl = document.getElementById('form-message');
  const yearEl = document.getElementById('year');

  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    messageEl.textContent = '';
    messageEl.classList.remove('success', 'error');

    const formData = new FormData(form);

    const payload = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      jarSize: formData.get('jarSize'),
      quantity: formData.get('quantity'),
      deliveryDate: formData.get('deliveryDate') || '',
      deliveryTime: formData.get('deliveryTime') || '',
      location: formData.get('location') || '',
      paymentMethod: formData.get('paymentMethod') || 'mpesa',
      amount: formData.get('amount') || '',
      notes: formData.get('notes') || '',
    };

    if (!payload.name || !payload.email || !payload.phone || !payload.jarSize || !payload.quantity) {
      messageEl.textContent = 'Please fill in all required fields.';
      messageEl.classList.add('error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      const response = await fetch('/api/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit order.');
      }

      let msg = 'Order received! I will deliver your honey as agreed.';
      if (payload.paymentMethod === 'mpesa') {
        msg += ' If M-Pesa is configured, you should shortly see a prompt on your phone to complete payment.';
      }

      messageEl.textContent = msg;
      messageEl.classList.add('success');
      form.reset();
    } catch (err) {
      console.error('Order error:', err);
      messageEl.textContent = err.message || 'Something went wrong. Please try again.';
      messageEl.classList.add('error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Book / Order Now';
    }
  });
});
