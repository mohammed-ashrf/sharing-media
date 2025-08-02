const express = require('express');
const router = express.Router();
const subuserController = require('../controllers/subuserController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get all subusers for the authenticated user
router.get('/', subuserController.getSubusers);

// Create a new subuser
router.post('/', subuserController.createSubuser);

// Update a subuser
router.put('/:id', subuserController.updateSubuser);

// Toggle subuser status (active/inactive)
router.patch('/:id/status', subuserController.toggleSubuserStatus);

// Delete a subuser
router.delete('/:id', subuserController.deleteSubuser);

module.exports = router;
