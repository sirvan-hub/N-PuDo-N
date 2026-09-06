import 'package:flutter/material.dart';
class CustomTextField extends StatelessWidget {
  final TextEditingController? controller; final String labelText; final TextInputType? keyboardType; final String? Function(String?)? validator;
  const CustomTextField({super.key, this.controller, required this.labelText, this.keyboardType, this.validator});
  @override Widget build(BuildContext context) {
    return TextFormField(
      controller: controller, keyboardType: keyboardType, validator: validator,
      decoration: InputDecoration(labelText: labelText, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
    );
  }
}
