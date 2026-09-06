import 'package:flutter/material.dart';
class CustomButton extends StatelessWidget {
  final String text; final VoidCallback? onPressed; final bool isLoading;
  const CustomButton({super.key, required this.text, this.onPressed, this.isLoading = false});
  @override Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: isLoading ? null : onPressed,
      style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
      child: isLoading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
    );
  }
}
