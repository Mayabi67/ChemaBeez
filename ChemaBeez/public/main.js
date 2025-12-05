document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('order-form');
  const submitBtn = document.getElementById('submit-btn');
  const messageEl = document.getElementById('form-message');
  const yearEl = document.getElementById('year');
  const jarSizeEl = document.getElementById('jarSize');
  const quantityEl = document.getElementById('quantity');
  const amountEl = document.getElementById('amount');

  const JAR_PRICES = {
    '250g': 300,
    '500g': 550,
    '1kg': 1000,
  };

  function calculateAmount(jarSize, quantity) {
    const unitPrice = JAR_PRICES[jarSize];
    const qty = Number(quantity);
    if (!unitPrice || !Number.isFinite(qty) || qty <= 0) {
      return '';
    }
    return unitPrice * qty;
  }

  function updateAmountField() {
    if (!amountEl || !jarSizeEl || !quantityEl) return;
    const total = calculateAmount(jarSizeEl.value, quantityEl.value);
    amountEl.value = total || '';
  }

  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  if (amountEl) {
    amountEl.readOnly = true;
  }

  if (jarSizeEl) {
    jarSizeEl.addEventListener('change', updateAmountField);
  }

  if (quantityEl) {
    quantityEl.addEventListener('input', updateAmountField);
  }

  updateAmountField();

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

    const computedAmount = calculateAmount(payload.jarSize, payload.quantity);

    if (computedAmount) {
      payload.amount = computedAmount;
      if (amountEl) {
        amountEl.value = computedAmount;
      }
    }

    if (!payload.name || !payload.phone || !payload.jarSize || !payload.quantity) {
      messageEl.textContent = 'Please fill in all required fields.';
      messageEl.classList.add('error');
      return;
    }

    if (payload.paymentMethod === 'mpesa' && !payload.amount) {
      messageEl.textContent = 'Please select a valid jar size and quantity to calculate the amount to pay.';
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
