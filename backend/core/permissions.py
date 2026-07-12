from rest_framework import permissions

class IsOwner(permissions.BasePermission):
    """
    Object-level permission to only allow owners of an object to access and edit it.
    Assumes the model instance has a `user` field.
    """

    def has_object_permission(self, request, view, obj):
        # Enforce that the user field on the object matches the logged-in user.
        # If the object is the User model itself, compare directly.
        if hasattr(obj, 'user'):
            return obj.user == request.user
        return obj == request.user
