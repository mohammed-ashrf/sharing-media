const Template = require('../models/Template');
const { generateStory } = require('./storyController');

/**
 * @desc    Get all templates for authenticated user (personal + public)
 * @route   GET /api/v1/templates
 * @access  Private
 */
const getTemplates = async (req, res) => {
  try {
    const { category, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const userId = req.user.id;

    // Build query
    let query = {
      $or: [
        { createdBy: userId }, // User's own templates
        { isPublic: true }     // Public templates
      ]
    };

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$and = [
        query.$or ? { $or: query.$or } : {},
        {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { tags: { $in: [new RegExp(search, 'i')] } }
          ]
        }
      ];
      delete query.$or;
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const templates = await Template.find(query)
      .sort(sortOptions)
      .populate('createdBy', 'firstName lastName')
      .lean();

    // Add user-specific data
    const templatesWithUserData = templates.map(template => ({
      ...template,
      isOwner: template.createdBy._id.toString() === userId,
      isFavorited: template.favorites.includes(userId)
    }));

    res.status(200).json({
      success: true,
      message: 'Templates retrieved successfully',
      data: {
        templates: templatesWithUserData,
        count: templatesWithUserData.length
      }
    });

  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching templates',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get public templates (no authentication required)
 * @route   GET /api/v1/templates/public
 * @access  Public
 */
const getPublicTemplates = async (req, res) => {
  try {
    const { category, search, limit = 20 } = req.query;

    let query = { isPublic: true };

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const templates = await Template.find(query)
      .sort({ useCount: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .populate('createdBy', 'firstName lastName')
      .select('-favorites') // Don't expose favorites in public endpoint
      .lean();

    res.status(200).json({
      success: true,
      message: 'Public templates retrieved successfully',
      data: {
        templates,
        count: templates.length
      }
    });

  } catch (error) {
    console.error('Error fetching public templates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching public templates',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get single template by ID
 * @route   GET /api/v1/templates/:id
 * @access  Private
 */
const getTemplate = async (req, res) => {
  try {
    const templateId = req.params.id;
    const userId = req.user.id;

    const template = await Template.findById(templateId)
      .populate('createdBy', 'firstName lastName email');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Check access permissions
    if (!template.isPublic && template.createdBy._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this template'
      });
    }

    // Add user-specific data
    const templateData = {
      ...template.toJSON(),
      isOwner: template.createdBy._id.toString() === userId,
      isFavorited: template.favorites.includes(userId)
    };

    res.status(200).json({
      success: true,
      message: 'Template retrieved successfully',
      data: templateData
    });

  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching template',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Create new template
 * @route   POST /api/v1/templates
 * @access  Private
 */
const createTemplate = async (req, res) => {
  try {
    const templateData = {
      ...req.body,
      createdBy: req.user.id
    };

    const template = await Template.create(templateData);
    
    await template.populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: template
    });

  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating template',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Update template
 * @route   PUT /api/v1/templates/:id
 * @access  Private
 */
const updateTemplate = async (req, res) => {
  try {
    const templateId = req.params.id;
    const userId = req.user.id;

    const template = await Template.findById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Check ownership
    if (template.createdBy.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this template'
      });
    }

    // Update template
    const updatedTemplate = await Template.findByIdAndUpdate(
      templateId,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName');

    res.status(200).json({
      success: true,
      message: 'Template updated successfully',
      data: updatedTemplate
    });

  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating template',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Delete template
 * @route   DELETE /api/v1/templates/:id
 * @access  Private
 */
const deleteTemplate = async (req, res) => {
  try {
    const templateId = req.params.id;
    const userId = req.user.id;

    const template = await Template.findById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Check ownership
    if (template.createdBy.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this template'
      });
    }

    await Template.findByIdAndDelete(templateId);

    res.status(200).json({
      success: true,
      message: 'Template deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting template',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Use template to generate a story
 * @route   POST /api/v1/templates/:id/use
 * @access  Private
 */
const useTemplate = async (req, res) => {
  try {
    const templateId = req.params.id;
    const userId = req.user.id;
    const { customValues = {} } = req.body;

    const template = await Template.findById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Check access permissions
    if (!template.isPublic && template.createdBy.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this template'
      });
    }

    // Process template with custom values
    const processTemplate = (templateString, values) => {
      if (!templateString) return '';
      
      let result = templateString;
      Object.keys(values).forEach(key => {
        const placeholder = `{{${key}}}`;
        result = result.replace(new RegExp(placeholder, 'g'), values[key] || '');
      });
      return result;
    };

    // Build story generation request from template
    const storyRequest = {
      storyStyle: template.settings.storyStyle,
      storyName: customValues.storyName || `Story from ${template.name}`,
      storyLength: template.settings.storyLength,
      storyTopic: processTemplate(template.settings.storyTopicTemplate, customValues),
      characterDetails: processTemplate(template.settings.characterDetailsTemplate, customValues),
      settingAtmosphere: processTemplate(template.settings.settingAtmosphereTemplate, customValues),
      selectedGenre: template.settings.selectedGenre,
      selectedFormat: template.settings.selectedFormat,
      selectedNarrative: template.settings.selectedNarrative,
      selectedAgeGroup: template.settings.selectedAgeGroup,
      language: template.settings.language || 'English'
    };

    // Increment template use count
    await Template.findByIdAndUpdate(templateId, {
      $inc: { useCount: 1 }
    });

    // Use the existing generateStory function
    req.body = storyRequest;
    return generateStory(req, res);

  } catch (error) {
    console.error('Error using template:', error);
    res.status(500).json({
      success: false,
      message: 'Error using template',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Add template to favorites
 * @route   POST /api/v1/templates/:id/favorite
 * @access  Private
 */
const favoriteTemplate = async (req, res) => {
  try {
    const templateId = req.params.id;
    const userId = req.user.id;

    const template = await Template.findById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Check if already favorited
    if (template.favorites.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Template already favorited'
      });
    }

    // Add to favorites
    await Template.findByIdAndUpdate(templateId, {
      $addToSet: { favorites: userId }
    });

    res.status(200).json({
      success: true,
      message: 'Template added to favorites'
    });

  } catch (error) {
    console.error('Error favoriting template:', error);
    res.status(500).json({
      success: false,
      message: 'Error favoriting template',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Remove template from favorites
 * @route   DELETE /api/v1/templates/:id/favorite
 * @access  Private
 */
const unfavoriteTemplate = async (req, res) => {
  try {
    const templateId = req.params.id;
    const userId = req.user.id;

    const template = await Template.findById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Remove from favorites
    await Template.findByIdAndUpdate(templateId, {
      $pull: { favorites: userId }
    });

    res.status(200).json({
      success: true,
      message: 'Template removed from favorites'
    });

  } catch (error) {
    console.error('Error unfavoriting template:', error);
    res.status(500).json({
      success: false,
      message: 'Error unfavoriting template',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  getTemplates,
  getPublicTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  useTemplate,
  favoriteTemplate,
  unfavoriteTemplate
};
