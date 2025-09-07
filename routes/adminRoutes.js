router.put('/users/:id', isAdmin, adminController.updateUser);
router.delete('/users/:id', isAdmin, adminController.deleteUser);
router.put('/update-admin-role', isAdmin, adminController.updateAdminRole); 