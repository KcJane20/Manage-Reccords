const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;

// Middleware to parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static HTML files from the current directory
app.use(express.static('.'));

// --- Database Connection Pool ---
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', //MySQL username
    password: 'Kcjn2025', //MySQL password
    database: 'boarding_house_db' //database name
}).promise();


async function executeQuery(sql, params = []) {
    try {
        const [rows] = await pool.execute(sql, params);
        return rows;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// --- API Endpoints ---

// 1. Add New Tenant (POST request from add_tenant.html)
app.post('/addTenant', async (req, res) => {
    const { fullName, roomNumber, dateMovedIn, contactNumber, rentAmount } = req.body;
    const sql = `
        INSERT INTO tenants (full_name, room_number, date_moved_in, contact_number, rent_amount)
        VALUES (?, ?, ?, ?, ?)
    `;
    try {
        const result = await executeQuery(sql, [fullName, roomNumber, dateMovedIn, contactNumber, rentAmount]);
        console.log('Tenant added:', result);
        res.status(200).send('Tenant added successfully!');
    } catch (error) {
        console.error('Error adding tenant:', error);
        res.status(500).send('Error adding tenant: ' + error.message);
    }
});

// 2. Remove Tenant (POST request from remove_tenant.html)
app.post('/removeTenant', async (req, res) => {
    const { tenantId } = req.body;
    try {
        // First, delete all payments for this tenant
        await executeQuery('DELETE FROM payments WHERE tenant_id = ?', [tenantId]);
        // Then, delete the tenant
        const result = await executeQuery('DELETE FROM tenants WHERE tenant_id = ?', [tenantId]);
        if (result.affectedRows === 0) {
            res.status(404).send('Tenant not found');
        } else {
            res.send('Tenant removed successfully!');
        }
    } catch (error) {
        console.error('Error removing tenant:', error);
        res.status(500).send('Error removing tenant');
    }
});

// 3. Record Payment (POST request from record_payment.html)
app.post('/recordPayment', async (req, res) => {
    const { tenantId, paymentMonth, paymentDate, amountPaid } = req.body;
    
    // Validate required fields
    if (!tenantId || !paymentMonth || !paymentDate || !amountPaid) {
        return res.status(400).send('Missing required fields');
    }

    try {
        // Validate tenant exists
        const tenantCheck = await executeQuery('SELECT tenant_id FROM tenants WHERE tenant_id = ?', [tenantId]);
        if (tenantCheck.length === 0) {
            return res.status(404).send('Tenant not found');
        }

        // Check for duplicate payment
        const duplicateCheck = await executeQuery(
            'SELECT payment_id FROM payments WHERE tenant_id = ? AND payment_month = ?',
            [tenantId, paymentMonth]
        );
        if (duplicateCheck.length > 0) {
            return res.status(400).send('Payment for this month already exists');
        }

        // Insert the payment
        const sql = `
            INSERT INTO payments (tenant_id, payment_month, payment_date, amount_paid)
            VALUES (?, ?, ?, ?)
        `;
        
        await executeQuery(sql, [
            tenantId, 
            paymentMonth, 
            paymentDate, 
            amountPaid
        ]);
        
        res.status(200).send('Payment recorded successfully!');
    } catch (error) {
        console.error('Error recording payment:', error);
        res.status(500).send('Error recording payment: ' + error.message);
    }
});

// 4. Check Payment Status (GET request from check_payment_status.html)
app.get('/getPaymentStatus', async (req, res) => {
    const { tenantId, paymentMonth } = req.query;
    const sql = 'SELECT amount_paid, payment_date, payment_type FROM payments WHERE tenant_id = ? AND payment_month = ?';
    try {
        const rows = await executeQuery(sql, [tenantId, paymentMonth]);
        if (rows.length > 0) {
            res.json({
                paid: true,
                amount_paid: rows[0].amount_paid,
                payment_date: rows[0].payment_date,
                payment_type: rows[0].payment_type
            });
        } else {
            res.json({
                paid: false
            });
        }
    } catch (error) {
        console.error('Error checking payment status:', error);
        res.status(500).json({ error: 'Error checking payment status' });
    }
});

// 5. View All Tenants (GET request when view_tenants.html loads - you might need client-side JS to fetch this)
app.get('/viewTenants', async (req, res) => {
    const sql = 'SELECT * FROM tenants';
    try {
        const tenants = await executeQuery(sql);
        res.json(tenants); // Send data as JSON to be used by client-side JS
    } catch (error) {
        res.status(500).send('Error fetching tenants');
    }
});

// 6. View All Payments (GET request when view_payments.html loads - you might need client-side JS to fetch this)
app.get('/viewPayments', async (req, res) => {
    const sql = 'SELECT * FROM payments';
    try {
        const payments = await executeQuery(sql);
        res.json(payments); // Send data as JSON
    } catch (error) {
        res.status(500).send('Error fetching payments');
    }
});

// 7. Update Tenant Information (POST request from update_tenant.html)
app.post('/updateTenant', async (req, res) => {
    const { tenantId, fullName, roomNumber, dateMovedIn, contactNumber, rentAmount } = req.body;
    
    // Build the SQL query dynamically based on provided fields
    let updateFields = [];
    let params = [];
    
    if (fullName && fullName.trim()) {
        updateFields.push('full_name = ?');
        params.push(fullName);
    }
    if (roomNumber && roomNumber.trim()) {
        updateFields.push('room_number = ?');
        params.push(roomNumber);
    }
    if (dateMovedIn && dateMovedIn.trim()) {
        updateFields.push('date_moved_in = ?');
        params.push(dateMovedIn);
    }
    if (contactNumber && contactNumber.trim()) {
        updateFields.push('contact_number = ?');
        params.push(contactNumber);
    }
    if (rentAmount && !isNaN(rentAmount)) {
        updateFields.push('rent_amount = ?');
        params.push(rentAmount);
    }
    
    if (updateFields.length === 0) {
        return res.status(400).send('No valid fields to update');
    }
    
    params.push(tenantId); // Add tenantId as the last parameter
    
    const sql = `
        UPDATE tenants
        SET ${updateFields.join(', ')}
        WHERE tenant_id = ?
    `;
    
    try {
        const result = await executeQuery(sql, params);
        console.log('Tenant updated:', result);
        res.send('Tenant updated successfully!');
    } catch (error) {
        console.error('Error updating tenant:', error);
        res.status(500).send('Error updating tenant');
    }
});

// 8. Update Payment Record (POST request from update_payment.html)
app.post('/updatePayment', async (req, res) => {
    const { paymentId, paymentMonth, paymentDate, amountPaid } = req.body;
    
    // Build the SQL query dynamically based on provided fields
    let updateFields = [];
    let params = [];
    
    if (paymentMonth && paymentMonth.trim()) {
        updateFields.push('payment_month = ?');
        params.push(paymentMonth);
    }
    if (paymentDate && paymentDate.trim()) {
        updateFields.push('payment_date = ?');
        params.push(paymentDate);
    }
    if (amountPaid && !isNaN(amountPaid)) {
        updateFields.push('amount_paid = ?');
        params.push(amountPaid);
    }
    
    if (updateFields.length === 0) {
        return res.status(400).send('No valid fields to update');
    }
    
    params.push(paymentId); // Add paymentId as the last parameter
    
    const sql = `
        UPDATE payments
        SET ${updateFields.join(', ')}
        WHERE payment_id = ?
    `;
    
    try {
        const result = await executeQuery(sql, params);
        if (result.affectedRows === 0) {
            res.status(404).send('Payment record not found');
        } else {
            console.log('Payment updated:', result);
            res.send('Payment updated successfully!');
        }
    } catch (error) {
        console.error('Error updating payment:', error);
        res.status(500).send('Error updating payment: ' + error.message);
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});